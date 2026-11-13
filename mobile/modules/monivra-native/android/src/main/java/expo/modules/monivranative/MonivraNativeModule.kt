package expo.modules.monivranative

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import java.io.ByteArrayOutputStream
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

private const val REQUEST_PHOTO = 46071

class MonivraNativeModule : Module() {
  private var pendingPhoto: Promise? = null
  private var photoFile: File? = null

  override fun definition() = ModuleDefinition {
    Name("MonivraNative")

    // Takes a photo with the camera application; resolves with the file:// uri of the photo, or null
    // when the person cancels.
    AsyncFunction("takePhoto") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val dir = File(activity.cacheDir, "photos").apply { mkdirs() }
      val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
      val uri = FileProvider.getUriForFile(activity, activity.packageName + ".monivra.photos", file)
      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        .putExtra(MediaStore.EXTRA_OUTPUT, uri)
        .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      pendingPhoto?.resolve(null)
      pendingPhoto = promise
      photoFile = file
      activity.startActivityForResult(intent, REQUEST_PHOTO)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_PHOTO) return@OnActivityResult
      val promise = pendingPhoto ?: return@OnActivityResult
      pendingPhoto = null
      val file = photoFile
      photoFile = null
      if (payload.resultCode == Activity.RESULT_OK && file != null && file.length() > 0) promise.resolve(Uri.fromFile(file).toString())
      else promise.resolve(null)
    }

    // A picked or taken photo as a small JPEG data URL (js/platform/photo.js: long side 800, quality 75),
    // turned the way the camera says it was held.
    Function("photoDataUrl") { uri: String, longSide: Int, quality: Int ->
      val path = Uri.parse(uri).path ?: throw Exception("The photo could not be read")
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(path, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw Exception("This photo is damaged and cannot be opened")
      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= longSide) sample *= 2
      val bitmap = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: throw Exception("This photo is damaged and cannot be opened")
      val degrees = when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
      }
      val scale = minOf(1f, longSide.toFloat() / maxOf(bitmap.width, bitmap.height))
      val matrix = Matrix().apply {
        postScale(scale, scale)
        postRotate(degrees)
      }
      val shown = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      val bytes = ByteArrayOutputStream().also { shown.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
      "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    // While on, the system hides the application in the recent-apps preview and refuses screenshots
    // (the first application's MonivraNativePlugin.setPrivacyScreen).
    Function("setSecure") { on: Boolean ->
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread {
        if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
      }
      true
    }

    // Opens the system's print dialog for a PDF file of the application (a file:// uri).
    Function("printPdf") { uri: String, name: String ->
      val activity = appContext.currentActivity ?: return@Function false
      val path = Uri.parse(uri).path ?: return@Function false
      activity.runOnUiThread {
        val manager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
        manager.print(name, object : PrintDocumentAdapter() {
          override fun onLayout(oldAttributes: PrintAttributes?, newAttributes: PrintAttributes?, cancellationSignal: CancellationSignal?, callback: LayoutResultCallback, extras: Bundle?) {
            if (cancellationSignal?.isCanceled == true) {
              callback.onLayoutCancelled()
              return
            }
            callback.onLayoutFinished(PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true)
          }

          override fun onWrite(pages: Array<out PageRange>?, destination: ParcelFileDescriptor, cancellationSignal: CancellationSignal?, callback: WriteResultCallback) {
            try {
              FileInputStream(File(path)).use { input -> FileOutputStream(destination.fileDescriptor).use { output -> input.copyTo(output) } }
              callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (error: Exception) {
              callback.onWriteFailed(error.message)
            }
          }
        }, null)
      }
      true
    }
  }
}
