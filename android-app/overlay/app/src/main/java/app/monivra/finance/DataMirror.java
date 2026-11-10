package app.monivra.finance;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The internal copy of the application's data in its private files. Written whole to a temporary
 * file, synced, then moved into place with the previous copy kept next to it; each copy carries a
 * SHA-256 of its text, so a copy cut short by a crash or damaged is recognised and never used.
 * Reading takes the newest copy that checks out.
 */
final class DataMirror {
    static final class Copy {
        final String text;
        final long savedAt;
        final String source;
        Copy(String text, long savedAt, String source) {
            this.text = text;
            this.savedAt = savedAt;
            this.source = source;
        }
    }

    private final File dir;

    DataMirror(File filesDir) {
        this.dir = new File(filesDir, "mirror");
    }

    private File current() { return new File(dir, "data.json"); }
    private File previous() { return new File(dir, "data.prev.json"); }
    private File temp() { return new File(dir, "data.tmp"); }

    static String sha256(byte[] bytes) throws IOException {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder out = new StringBuilder();
            for (byte b : digest) out.append(String.format("%02x", b));
            return out.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }

    synchronized void write(String text) throws IOException {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cannot create folder");
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        try {
            JSONObject wrapper = new JSONObject();
            wrapper.put("v", 1);
            wrapper.put("savedAt", System.currentTimeMillis());
            wrapper.put("sha256", sha256(bytes));
            wrapper.put("text", text);
            try (FileOutputStream out = new FileOutputStream(temp())) {
                out.write(wrapper.toString().getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
        } catch (JSONException e) {
            throw new IOException(e);
        }
        if (current().exists() && !current().renameTo(previous()))
            throw new IOException("cannot keep the previous copy");
        if (!temp().renameTo(current())) throw new IOException("cannot put the copy in place");
    }

    private Copy read(File file, String source) {
        if (!file.isFile()) return null;
        try (FileInputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream all = new ByteArrayOutputStream();
            byte[] buffer = new byte[65536];
            int n;
            while ((n = in.read(buffer)) > 0) all.write(buffer, 0, n);
            JSONObject wrapper = new JSONObject(new String(all.toByteArray(), StandardCharsets.UTF_8));
            String text = wrapper.getString("text");
            if (!sha256(text.getBytes(StandardCharsets.UTF_8)).equals(wrapper.getString("sha256")))
                return null;
            return new Copy(text, wrapper.getLong("savedAt"), source);
        } catch (IOException | JSONException e) {
            return null;
        }
    }

    /** Null when no copy exists at all; throws when copies exist but none checks out. */
    synchronized Copy newest() throws IOException {
        boolean any = current().exists() || previous().exists() || temp().exists();
        if (!any) return null;
        Copy best = null;
        for (Copy c : new Copy[] {
            read(current(), "current"), read(previous(), "previous"), read(temp(), "temp") }) {
            if (c != null && (best == null || c.savedAt > best.savedAt)) best = c;
        }
        if (best == null) throw new IOException("no copy checks out");
        return best;
    }
}
