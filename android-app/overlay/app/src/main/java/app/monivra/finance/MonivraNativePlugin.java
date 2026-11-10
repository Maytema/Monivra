package app.monivra.finance;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.print.PrintManager;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The native side of Monivra: files (save, share, print), biometric unlock, secure storage of the PIN
 * verifier, the internal copy of the data, and the look of the system bars. Everything works on
 * content addresses and system screens; there is no storage permission and no file path is ever
 * given to another application.
 */
@CapacitorPlugin(name = "MonivraNative")
public class MonivraNativePlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private SecureStore secure;
    private DataMirror mirror;

    @Override
    public void load() {
        File files = getContext().getFilesDir();
        secure = new SecureStore(files);
        mirror = new DataMirror(files);
        // Files prepared for sharing or printing earlier are not kept.
        executor.execute(() -> {
            deleteContents(new File(getContext().getCacheDir(), "shared"));
            deleteContents(new File(getContext().getCacheDir(), "print"));
        });
    }

    // The window loses the screen the moment the recent-apps screen opens, before it is stopped, and
    // Capacitor's own "app state" event only fires on stop. These two events say it at once, so a lock
    // that is set to engage when the app is left also engages when the app is left through Recents.
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        notifyListeners("activityPause", new JSObject());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        notifyListeners("activityResume", new JSObject());
    }

    private static void deleteContents(File dir) {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File child : children) //noinspection ResultOfMethodCallIgnored
            child.delete();
    }

    private static JSObject status(String value) {
        JSObject o = new JSObject();
        o.put("status", value);
        return o;
    }

    // A file name that cannot point outside its folder.
    private static String safeName(String name, String fallback) {
        String clean = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (clean.isEmpty() || clean.equals(".") || clean.equals("..")) return fallback;
        return clean.length() > 120 ? clean.substring(clean.length() - 120) : clean;
    }

    private static byte[] decode(PluginCall call) {
        String data = call.getString("data");
        if (data == null) return null;
        try {
            return Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private File stage(String folder, String name, byte[] bytes) throws IOException {
        File dir = new File(getContext().getCacheDir(), folder);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cannot create folder");
        deleteContents(dir);
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
            out.getFD().sync();
        }
        return file;
    }

    // ---- Save: the system "save as" screen; the person chooses where the file goes ----

    @PluginMethod
    public void saveDocument(PluginCall call) {
        if (call.getString("name") == null || call.getString("data") == null) {
            call.reject("name and data are required");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, safeName(call.getString("name"), "monivra"));
        startActivityForResult(call, intent, "saveDocumentResult");
    }

    @ActivityCallback
    private void saveDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve(status("cancelled"));
            return;
        }
        Uri uri = data.getData();
        byte[] bytes = decode(call);
        if (bytes == null) {
            call.reject("bad data");
            return;
        }
        executor.execute(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("no stream");
                out.write(bytes);
                out.flush();
                call.resolve(status("saved"));
            } catch (IOException | RuntimeException e) {
                call.reject("write failed");
            }
        });
    }

    // ---- Share: the system share sheet with the file attached by content address ----

    @PluginMethod
    public void shareDocument(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null || call.getString("name") == null) {
            call.reject("name and data are required");
            return;
        }
        String name = safeName(call.getString("name"), "monivra");
        String mime = call.getString("mime", "application/octet-stream");
        executor.execute(() -> {
            try {
                File file = stage("shared", name, bytes);
                Uri uri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri(name, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, null);
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(chooser);
                        call.resolve(status("opened"));
                    } catch (RuntimeException e) {
                        call.reject("no share sheet");
                    }
                });
            } catch (IOException | RuntimeException e) {
                call.reject("could not prepare the file");
            }
        });
    }

    // ---- Print: the system print service, given the PDF itself ----

    @PluginMethod
    public void printPdf(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null || call.getString("name") == null) {
            call.reject("name and data are required");
            return;
        }
        String name = safeName(call.getString("name"), "monivra.pdf");
        executor.execute(() -> {
            try {
                File file = stage("print", name, bytes);
                getActivity().runOnUiThread(() -> {
                    try {
                        PrintManager manager =
                            (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        // The call is answered when the print screen is closed.
                        manager.print(name, new PdfPrintAdapter(getContext(), file, name, executor,
                            () -> call.resolve(status("closed"))), null);
                    } catch (RuntimeException e) {
                        call.reject("print service unavailable");
                    }
                });
            } catch (IOException | RuntimeException e) {
                call.reject("could not prepare the file");
            }
        });
    }

    // ---- Biometric unlock: the system prompt says yes or no; nothing of the person is read ----

    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void biometricStatus(PluginCall call) {
        int result = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        String state;
        if (result == BiometricManager.BIOMETRIC_SUCCESS) state = "available";
        else if (result == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) state = "not_enrolled";
        else state = "unsupported";
        call.resolve(status(state));
    }

    @PluginMethod
    public void biometricAuthenticate(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt(getActivity(),
                    ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                            JSObject o = new JSObject();
                            o.put("result", "ok");
                            call.resolve(o);
                        }

                        @Override
                        public void onAuthenticationError(int code, CharSequence message) {
                            String result;
                            if (code == BiometricPrompt.ERROR_USER_CANCELED
                                || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || code == BiometricPrompt.ERROR_CANCELED) result = "cancelled";
                            else if (code == BiometricPrompt.ERROR_LOCKOUT
                                || code == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) result = "lockout";
                            else result = "failed";
                            JSObject o = new JSObject();
                            o.put("result", result);
                            call.resolve(o);
                        }
                        // A finger that does not match is not an end: the prompt stays and lets the
                        // person try again, and the system locks it out after too many tries.
                    });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(call.getString("title", "Monivra"))
                    .setSubtitle(call.getString("subtitle"))
                    .setNegativeButtonText(call.getString("negative", "PIN"))
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .setConfirmationRequired(false)
                    .build();
                prompt.authenticate(info);
            } catch (RuntimeException e) {
                JSObject o = new JSObject();
                o.put("result", "failed");
                call.resolve(o);
            }
        });
    }

    // ---- Secure storage of the PIN verifier ----

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        executor.execute(() -> {
            try {
                secure.put(key, value);
                call.resolve(status("ok"));
            } catch (Exception e) {
                call.reject("could not store");
            }
        });
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        executor.execute(() -> {
            JSObject o = new JSObject();
            try {
                if (!secure.exists(key)) o.put("status", "missing");
                else {
                    o.put("value", secure.get(key));
                    o.put("status", "ok");
                }
            } catch (Exception e) {
                o = new JSObject();
                o.put("status", "error");
            }
            call.resolve(o);
        });
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        executor.execute(() -> {
            try {
                secure.remove(key);
                call.resolve(status("ok"));
            } catch (Exception e) {
                call.reject("could not remove");
            }
        });
    }

    // ---- The internal copy of the data ----

    @PluginMethod
    public void mirrorWrite(PluginCall call) {
        String text = call.getString("text");
        long seq = call.getInt("seq", 0);
        if (text == null) {
            call.reject("text is required");
            return;
        }
        executor.execute(() -> {
            try {
                mirror.write(text, seq);
                call.resolve(status("ok"));
            } catch (IOException e) {
                call.reject("could not write the copy");
            }
        });
    }

    @PluginMethod
    public void mirrorRead(PluginCall call) {
        executor.execute(() -> {
            JSObject o = new JSObject();
            try {
                DataMirror.Copy copy = mirror.newest();
                if (copy == null) o.put("status", "missing");
                else {
                    o.put("status", "ok");
                    o.put("text", copy.text);
                    o.put("savedAt", copy.savedAt);
                    o.put("seq", copy.seq);
                    o.put("source", copy.source);
                }
            } catch (IOException e) {
                o = new JSObject();
                o.put("status", "error");
            }
            call.resolve(o);
        });
    }

    // ---- System bars and the recents preview ----

    @PluginMethod
    public void setSystemBars(PluginCall call) {
        String color = call.getString("color");
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            try {
                int c = android.graphics.Color.parseColor(color);
                Window window = getActivity().getWindow();
                window.getDecorView().setBackgroundColor(c);
                window.setStatusBarColor(c);
                window.setNavigationBarColor(c);
                WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
                controller.setAppearanceLightStatusBars(!dark);
                controller.setAppearanceLightNavigationBars(!dark);
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("bad color");
            }
        });
    }

    // While on, Android hides the application in the recent-apps preview and blocks screenshots.
    @PluginMethod
    public void setPrivacyScreen(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            if (on) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE);
            else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }
}
