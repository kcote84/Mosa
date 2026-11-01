package app.mosa.frame;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;

final class FrameUpdater {
    private static final String ORIGIN = "https://mosa-506ef.web.app";
    private final Context context;
    private final File directory;
    FrameUpdater(Context context) { this.context = context.getApplicationContext(); directory = new File(context.getFilesDir(), "updates"); directory.mkdirs(); }
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("mosa-updates", Context.MODE_PRIVATE); }
    private File apk() { return new File(directory, "pending.apk"); }
    private File metadata() { return new File(directory, "release.json"); }
    static void state(Context context, String value) { prefs(context).edit().putString("state", value).apply(); }
    void recoverStalledInstall() {
        SharedPreferences p = prefs(context);
        if (!"installing".equals(p.getString("state", "")) || System.currentTimeMillis() - p.getLong("sessionStartedAt", 0) < 10 * 60 * 1000L) return;
        try { context.getPackageManager().getPackageInstaller().abandonSession(p.getInt("sessionId", -1)); } catch (Exception ignored) { }
        state(context, apk().isFile() && metadata().isFile() ? "ready" : "idle");
    }
    void reconcile() {
        try {
            JSONObject release = new JSONObject(new String(FrameStore.read(metadata()), "UTF-8"));
            if (release.optInt("versionCode") <= BuildConfig.VERSION_CODE) { apk().delete(); metadata().delete(); prefs(context).edit().remove("pendingVersion").putString("state", "up_to_date").apply(); return; }
        } catch (Exception ignored) { }
        String state = prefs(context).getString("state", "idle");
        if (!UpdateService.running && ("checking".equals(state) || "downloading".equals(state))) state(context, "idle");
        recoverStalledInstall();
    }
    private HttpURLConnection open(String path) throws Exception {
        // No credentials, redirects or arbitrary update hosts. Album access is never sent here.
        HttpURLConnection c = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Cache-Control", "no-cache");
        return c;
    }
    private JSONObject latest() throws Exception {
        HttpURLConnection c = open("/updates/frame.json");
        try {
            if (c.getResponseCode() != 200) throw new IOException("offline");
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int n;
                while ((n = in.read(buffer)) != -1) { out.write(buffer, 0, n); if (out.size() > 16384) throw new IOException("invalid_update"); }
                JSONObject release = new JSONObject(out.toString("UTF-8"));
                if (!"app.mosa.frame".equals(release.optString("packageName")) || !UpdatePolicy.validRelease(release.optInt("versionCode"), release.optString("versionName"), release.optLong("bytes"), release.optString("sha256"), release.optString("path"), release.optInt("minSdk"), Build.VERSION.SDK_INT)) throw new IOException("invalid_update");
                return release;
            }
        } finally { c.disconnect(); }
    }
    private static String digest(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) { byte[] buffer = new byte[16384]; int n; while ((n = in.read(buffer)) != -1) digest.update(buffer, 0, n); }
        StringBuilder result = new StringBuilder(); for (byte b : digest.digest()) result.append(String.format("%02x", b & 255)); return result.toString();
    }
    @SuppressWarnings("deprecation")
    private void verify(File file, JSONObject release) throws Exception {
        if (file.length() != release.getLong("bytes") || !digest(file).equals(release.getString("sha256"))) throw new IOException("invalid_update");
        PackageManager pm = context.getPackageManager();
        PackageInfo installed = pm.getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNATURES);
        PackageInfo next = pm.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        if (next == null || !context.getPackageName().equals(next.packageName) || next.versionCode != release.getInt("versionCode")
            || next.versionCode <= installed.versionCode || !release.getString("versionName").equals(next.versionName)
            || next.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT || (next.applicationInfo.flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) throw new IOException("invalid_update");
        Signature[] a = installed.signatures, b = next.signatures;
        if (a == null || b == null || a.length != 1 || b.length != 1 || !Arrays.equals(a[0].toByteArray(), b[0].toByteArray())) throw new IOException("invalid_update");
    }
    void check() {
        SharedPreferences prefs = prefs(context);
        prefs.edit().putLong("lastAttempt", System.currentTimeMillis()).putString("state", "checking").apply();
        File temporary = new File(directory, "download.part");
        try {
            JSONObject release = latest(); int code = release.getInt("versionCode");
            prefs.edit().putString("latestVersion", release.getString("versionName")).apply();
            if (code <= BuildConfig.VERSION_CODE) {
                apk().delete(); metadata().delete();
                prefs.edit().remove("pendingVersion").putString("state", "up_to_date").putLong("lastSuccess", System.currentTimeMillis()).apply(); return;
            }
            boolean cached = false;
            if (apk().isFile()) { try { verify(apk(), release); cached = true; } catch (Exception ignored) { } }
            if (!cached) {
                if (directory.getUsableSpace() < release.getLong("bytes") + 150L * 1024 * 1024) throw new IOException("storage_full");
                state(context, "downloading"); HttpURLConnection c = open(release.getString("path"));
                long deadline = android.os.SystemClock.elapsedRealtime() + 8 * 60 * 1000L;
                try {
                    if (c.getResponseCode() != 200) throw new IOException("offline");
                    try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(temporary)) {
                        byte[] buffer = new byte[16384]; int n; long total = 0;
                        while ((n = in.read(buffer)) != -1) {
                            total += n;
                            if (total > release.getLong("bytes") || android.os.SystemClock.elapsedRealtime() > deadline) throw new IOException("invalid_update");
                            out.write(buffer, 0, n);
                        }
                        out.getFD().sync();
                    }
                    verify(temporary, release);
                    if (!temporary.renameTo(apk())) throw new IOException("storage_full");
                } finally { c.disconnect(); }
            }
            FrameStore.writeAtomic(metadata(), release.toString().getBytes("UTF-8"));
            prefs.edit().putInt("pendingVersion", code).putString("state", "ready").putLong("lastSuccess", System.currentTimeMillis()).apply();
        } catch (Exception e) { prefs.edit().putString("state", "error").putString("error", "storage_full".equals(e.getMessage()) ? "storage_full" : "invalid_update".equals(e.getMessage()) ? "invalid_update" : "offline").apply(); }
        finally { temporary.delete(); }
    }
    boolean automaticReady(boolean forceNow) {
        SharedPreferences p = prefs(context);
        int version = p.getInt("pendingVersion", 0);
        return "ready".equals(p.getString("state", "")) && version > BuildConfig.VERSION_CODE
            && UpdatePolicy.automaticAllowed(System.currentTimeMillis(), UpdateScheduler.zone(context), MosaDeviceAdmin.isOwner(context),
                context.getSharedPreferences("mosa", 0).getLong("lastInteraction", 0), version, p.getInt("automaticAttemptVersion", 0), p.getLong("automaticAttemptAt", 0), forceNow);
    }
    void installAutomatically(boolean forceNow) {
        if (!automaticReady(forceNow)) return;
        try { install(true); }
        catch (Exception e) {
            prefs(context).edit().putString("state", "ready").putInt("lastInstallStatus", PackageInstaller.STATUS_FAILURE).apply();
            android.util.Log.w("MosaUpdates", "Automatic installation deferred: " + e.getClass().getSimpleName());
        }
    }
    void install() throws Exception { install(false); }
    private void install(boolean automatic) throws Exception {
        JSONObject release = new JSONObject(new String(FrameStore.read(metadata()), "UTF-8"));
        verify(apk(), release); // Verify again immediately before handing the private file to Android.
        if (automatic && !MosaDeviceAdmin.isOwner(context)) throw new SecurityException("Managed frame required");
        // Persist before committing a session: replacing our own APK kills this process.
        if (automatic && !prefs(context).edit().putInt("automaticAttemptVersion", release.getInt("versionCode")).putLong("automaticAttemptAt", System.currentTimeMillis()).commit()) throw new IOException("Cannot persist installation attempt");
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        for (PackageInstaller.SessionInfo old : installer.getMySessions()) installer.abandonSession(old.getSessionId());
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(context.getPackageName()); params.setSize(apk().length());
        if (Build.VERSION.SDK_INT >= 31 && MosaDeviceAdmin.isOwner(context)) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id); InputStream in = new FileInputStream(apk()); OutputStream out = session.openWrite("base.apk", 0, apk().length())) {
            byte[] buffer = new byte[16384]; int n; while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n); session.fsync(out); out.close();
            if (!prefs(context).edit().putInt("sessionId", id).putBoolean("automaticSession", automatic).putLong("sessionStartedAt", System.currentTimeMillis()).putString("state", "installing").commit()) throw new IOException("Cannot persist installation session");
            Intent result = new Intent(context, UpdateInstallReceiver.class).setAction("app.mosa.frame.UPDATE_RESULT");
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(context, id, result, flags).getIntentSender());
        } catch (Exception e) { installer.abandonSession(id); throw e; }
    }
}
