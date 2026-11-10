package app.monivra.finance;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfDocument;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.pdf.PrintedPdfDocument;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;

/**
 * Hands a PDF file to the system print service. When all pages are printed the file is copied as it
 * is, so the text stays text; when the person picks a range of pages, those pages are drawn into a
 * new PDF (as pictures) because the print service expects exactly the pages it asked for.
 */
final class PdfPrintAdapter extends PrintDocumentAdapter {
    interface Done { void run(); }

    private final Context context;
    private final File file;
    private final String name;
    private final ExecutorService executor;
    private final Done done;
    private final Handler main = new Handler(Looper.getMainLooper());
    private PrintAttributes attributes;
    private int pageCount = PrintDocumentInfo.PAGE_COUNT_UNKNOWN;

    PdfPrintAdapter(Context context, File file, String name, ExecutorService executor, Done done) {
        this.context = context;
        this.file = file;
        this.name = name;
        this.executor = executor;
        this.done = done;
    }

    @Override
    public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                         CancellationSignal cancel, LayoutResultCallback callback, Bundle extras) {
        if (cancel.isCanceled()) {
            callback.onLayoutCancelled();
            return;
        }
        attributes = newAttributes;
        if (pageCount == PrintDocumentInfo.PAGE_COUNT_UNKNOWN) {
            try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                 PdfRenderer renderer = new PdfRenderer(fd)) {
                pageCount = renderer.getPageCount();
            } catch (IOException | RuntimeException e) {
                callback.onLayoutFailed("The PDF cannot be read");
                return;
            }
        }
        PrintDocumentInfo info = new PrintDocumentInfo.Builder(name)
            .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
            .setPageCount(pageCount)
            .build();
        callback.onLayoutFinished(info, !newAttributes.equals(oldAttributes));
    }

    @Override
    public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                        CancellationSignal cancel, WriteResultCallback callback) {
        boolean all = pages.length == 1 && PageRange.ALL_PAGES.equals(pages[0]);
        executor.execute(() -> {
            try {
                if (all) copyWhole(destination);
                else drawPages(pages, destination);
                if (cancel.isCanceled()) {
                    main.post(callback::onWriteCancelled);
                    return;
                }
                main.post(() -> callback.onWriteFinished(all ? new PageRange[] {PageRange.ALL_PAGES} : pages));
            } catch (IOException | RuntimeException e) {
                main.post(() -> callback.onWriteFailed("The PDF could not be written"));
            }
        });
    }

    private void copyWhole(ParcelFileDescriptor destination) throws IOException {
        try (InputStream in = new FileInputStream(file);
             OutputStream out = new FileOutputStream(destination.getFileDescriptor())) {
            byte[] buffer = new byte[65536];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            out.flush();
        }
    }

    private void drawPages(PageRange[] ranges, ParcelFileDescriptor destination) throws IOException {
        PrintedPdfDocument document = new PrintedPdfDocument(context, attributes);
        try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
             PdfRenderer renderer = new PdfRenderer(fd)) {
            for (PageRange range : ranges) {
                for (int index = range.getStart(); index <= range.getEnd() && index < renderer.getPageCount(); index++) {
                    PdfRenderer.Page source = renderer.openPage(index);
                    int width = 1240; // A4 at 150 dpi
                    int height = Math.max(1, Math.round(width * (float) source.getHeight() / source.getWidth()));
                    Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                    bitmap.eraseColor(Color.WHITE);
                    source.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT);
                    source.close();
                    PdfDocument.Page page = document.startPage(index);
                    Canvas canvas = page.getCanvas();
                    canvas.drawBitmap(bitmap, null,
                        new android.graphics.Rect(0, 0, canvas.getWidth(), canvas.getHeight()), null);
                    document.finishPage(page);
                    bitmap.recycle();
                }
            }
            try (OutputStream out = new FileOutputStream(destination.getFileDescriptor())) {
                document.writeTo(out);
            }
        } finally {
            document.close();
        }
    }

    @Override
    public void onFinish() {
        done.run();
    }
}
