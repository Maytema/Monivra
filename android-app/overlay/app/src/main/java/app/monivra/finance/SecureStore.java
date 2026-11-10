package app.monivra.finance;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Small values (the PIN verifier) encrypted with an AES-GCM key of the Android Keystore. The key
 * cannot be exported; where the phone has secure hardware the key lives in it. Each value is a file
 * in the private folder of the application: [iv length][iv][cipher text]. The name of the value is
 * bound to the encrypted text, so a file cannot be swapped for another value's.
 */
final class SecureStore {
    private static final String ALIAS = "monivra_secure_v1";
    private static final String PROVIDER = "AndroidKeyStore";
    private final File dir;

    SecureStore(File filesDir) {
        this.dir = new File(filesDir, "secure");
    }

    private static SecretKey key() throws GeneralSecurityException, IOException {
        KeyStore store = KeyStore.getInstance(PROVIDER);
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER);
            generator.init(new KeyGenParameterSpec.Builder(
                    ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }

    private File fileFor(String name) {
        if (!name.matches("[a-z0-9_]{1,32}")) throw new IllegalArgumentException("bad name");
        return new File(dir, name + ".bin");
    }

    boolean exists(String name) {
        return fileFor(name).exists();
    }

    void put(String name, String value) throws GeneralSecurityException, IOException {
        File target = fileFor(name);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cannot create folder");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        File temp = new File(dir, name + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(iv.length);
            out.write(iv);
            out.write(encrypted);
            out.getFD().sync();
        }
        if (!temp.renameTo(target)) throw new IOException("cannot replace value");
    }

    /** The value, or throws when it cannot be read (damaged, key gone). */
    String get(String name) throws GeneralSecurityException, IOException {
        File source = fileFor(name);
        byte[] all = new byte[(int) source.length()];
        try (FileInputStream in = new FileInputStream(source)) {
            int read = 0;
            while (read < all.length) {
                int n = in.read(all, read, all.length - read);
                if (n < 0) throw new IOException("short file");
                read += n;
            }
        }
        if (all.length < 14) throw new IOException("short file");
        int ivLength = all[0] & 0xff;
        if (ivLength < 12 || all.length < 1 + ivLength + 16) throw new IOException("bad file");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 1, ivLength));
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        byte[] plain = cipher.doFinal(all, 1 + ivLength, all.length - 1 - ivLength);
        return new String(plain, StandardCharsets.UTF_8);
    }

    void remove(String name) {
        File target = fileFor(name);
        if (target.exists() && !target.delete()) throw new IllegalStateException("cannot delete");
    }
}
