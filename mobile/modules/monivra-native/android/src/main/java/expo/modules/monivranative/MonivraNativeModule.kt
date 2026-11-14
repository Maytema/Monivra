package expo.modules.monivranative

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import java.io.ByteArrayOutputStream
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
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
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

private const val REQUEST_PHOTO = 46071
private val PHOTO_TYPES = setOf("image/jpeg", "image/png", "image/webp")

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
    // turned the way the camera says it was held. Only a real JPEG, PNG or WebP picture of at most maxBytes is
    // taken, whatever the file is called; the codes PHOTO_SIZE, PHOTO_FORMAT and PHOTO_DAMAGED tell the screen why not.
    Function("photoDataUrl") { uri: String, longSide: Int, quality: Int, maxBytes: Double ->
      val path = Uri.parse(uri).path ?: throw Exception("PHOTO_UNREADABLE")
      if (File(path).length() > maxBytes) throw Exception("PHOTO_SIZE")
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(path, bounds)
      val mime = bounds.outMimeType
      if (mime == null || mime !in PHOTO_TYPES) throw Exception("PHOTO_FORMAT")
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw Exception("PHOTO_DAMAGED")
      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= longSide) sample *= 2
      val bitmap = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: throw Exception("PHOTO_DAMAGED")
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

    // PBKDF2-HMAC-SHA256, 32 bytes, as hex: the PIN check. The system's implementation takes milliseconds
    // where the same rounds in JavaScript took seconds (src/domain/pin.ts keeps that one for the tests and
    // for a phone without this algorithm, where this function throws and the caller falls back).
    Function("pbkdf2") { password: String, saltHex: String, iterations: Int ->
      val salt = ByteArray(saltHex.length / 2) { saltHex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
      val spec = PBEKeySpec(password.toCharArray(), salt, iterations, 256)
      try {
        SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded.joinToString("") { "%02x".format(it) }
      } finally {
        spec.clearPassword()
      }
    }

    // A short touch signal: "tick" (something was picked up or selected), "success", "warning", "error"
    // (two quick knocks: a wrong PIN, a refused file). It is sent as touch feedback, so the phone's own
    // setting for touch vibration decides whether and how strongly it is felt.
    Function("haptic") { kind: String ->
      val context = appContext.reactContext ?: return@Function false
      val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return@Function false
      if (!vibrator.hasVibrator()) return@Function false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val effect = VibrationEffect.createPredefined(
            when (kind) {
              "error" -> VibrationEffect.EFFECT_DOUBLE_CLICK
              "warning" -> VibrationEffect.EFFECT_HEAVY_CLICK
              "success" -> VibrationEffect.EFFECT_CLICK
              else -> VibrationEffect.EFFECT_TICK
            }
          )
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
          else vibrator.vibrate(effect)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          vibrator.vibrate(
            if (kind == "error") VibrationEffect.createWaveform(longArrayOf(0, 30, 70, 30), -1)
            else VibrationEffect.createOneShot(if (kind == "tick") 15L else 25L, VibrationEffect.DEFAULT_AMPLITUDE)
          )
        } else if (kind == "error") {
          vibrator.vibrate(longArrayOf(0, 30, 70, 30), -1)
        } else {
          vibrator.vibrate(if (kind == "tick") 15L else 25L)
        }
        true
      } catch (error: Exception) {
        false
      }
    }

    // Pages [from, from + count) of a PDF file of the application (a file:// uri) drawn by the system's renderer
    // as JPEG pictures `widthPx` wide, in the cache folder report-preview/<id>; resolves with their file:// uris.
    // An async function: it runs off the JavaScript thread, so the application answers touches meanwhile.
    AsyncFunction("renderPdfPages") { uri: String, from: Int, count: Int, widthPx: Int, id: String ->
      val context = appContext.reactContext ?: throw Exception("PDF_NO_CONTEXT")
      val path = Uri.parse(uri).path ?: throw Exception("PDF_UNREADABLE")
      val folder = File(context.cacheDir, "report-preview/$id").apply { mkdirs() }
      val made = ArrayList<String>()
      val descriptor = ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY)
      try {
        val renderer = PdfRenderer(descriptor)
        try {
          val end = minOf(renderer.pageCount, from + count)
          for (index in from until end) {
            val page = renderer.openPage(index)
            try {
              val height = (widthPx.toLong() * page.height / page.width).toInt()
              val bitmap = Bitmap.createBitmap(widthPx, height, Bitmap.Config.ARGB_8888)
              bitmap.eraseColor(Color.WHITE)
              page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              val file = File(folder, "page-$index.jpg")
              FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 88, it) }
              bitmap.recycle()
              made.add(Uri.fromFile(file).toString())
            } finally {
              page.close()
            }
          }
        } finally {
          renderer.close()
        }
      } finally {
        descriptor.close()
      }
      made
    }

    // Deletes the pictures and PDF files of report previews other than `keep` (ids), so the cache does not grow.
    Function("dropReportPreviews") { keep: List<String> ->
      val context = appContext.reactContext ?: return@Function false
      File(context.cacheDir, "report-preview").listFiles()?.forEach { if (it.name !in keep) it.deleteRecursively() }
      context.cacheDir.listFiles()?.forEach {
        if (it.name.startsWith("report-") && it.name.endsWith(".pdf") && it.name.removePrefix("report-").removeSuffix(".pdf") !in keep) it.delete()
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
