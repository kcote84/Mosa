package app.mosa.frame;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Persistent photos belong in files/, never in Android's evictable cache/. */
final class FrameStore {
    final Context context;
    final File photosDir;
    FrameStore(Context context) { this.context = context; photosDir = new File(context.getFilesDir(), "photos"); photosDir.mkdirs(); }
    static byte[] read(File file) throws IOException {
        try (FileInputStream in = new AtomicFile(file).openRead(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] block = new byte[16384]; int n;
            while ((n = in.read(block)) != -1) out.write(block, 0, n);
            return out.toByteArray();
        }
    }
    static void writeAtomic(File file, byte[] bytes) throws IOException {
        AtomicFile atomic = new AtomicFile(file); FileOutputStream out = null;
        try { out = atomic.startWrite(); out.write(bytes); atomic.finishWrite(out); }
        catch (IOException e) { if (out != null) atomic.failWrite(out); throw e; }
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias("mosa-frame-credentials")) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("mosa-frame-credentials", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            return generator.generateKey();
        }
        return (SecretKey) store.getKey("mosa-frame-credentials", null);
    }
    JSONObject credentials() throws Exception {
        File file = new File(context.getFilesDir(), "credentials.enc"); if (!file.exists()) return null;
        JSONObject envelope = new JSONObject(new String(read(file), "UTF-8"));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), "UTF-8"));
    }
    void saveCredentials(JSONObject value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject envelope = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("data", Base64.encodeToString(cipher.doFinal(value.toString().getBytes("UTF-8")), Base64.NO_WRAP));
        writeAtomic(new File(context.getFilesDir(), "credentials.enc"), envelope.toString().getBytes("UTF-8"));
    }
    File provisioningFile() {
        File privateFile = new File(context.getFilesDir(), "provisioning.json");
        if (privateFile.exists()) return privateFile;
        File external = context.getExternalFilesDir(null);
        if (external != null) { File file = new File(external, "provisioning.json"); if (file.exists()) return file; }
        return null;
    }
    JSONObject manifest() {
        try { File file = new File(context.getFilesDir(), "manifest.json"); return file.exists() ? new JSONObject(new String(read(file), "UTF-8")) : new JSONObject().put("photos", new JSONArray()); }
        catch (Exception e) { return new JSONObject(); }
    }
    void saveManifest(JSONObject value) throws Exception { writeAtomic(new File(context.getFilesDir(), "manifest.json"), value.toString().getBytes("UTF-8")); }
    File photo(String id) { if (!id.matches("[A-Za-z0-9_-]{1,128}")) throw new IllegalArgumentException("Invalid photo id"); return new File(photosDir, id + ".jpg"); }
    void clearPhotos() {
        File[] files = photosDir.listFiles(); if (files != null) for (File file : files) file.delete();
        new File(context.getFilesDir(), "manifest.json").delete();
    }
    void revoke() { new File(context.getFilesDir(), "credentials.enc").delete(); clearPhotos(); }
}
