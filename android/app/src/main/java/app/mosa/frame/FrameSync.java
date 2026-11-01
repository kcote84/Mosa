package app.mosa.frame;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;

final class FrameSync {
    interface Listener {
        void onComplete(JSONObject manifest, String message);
        void onError(String code);
        default boolean needsRefresh() { return false; }
        default void onUpdateRequest(JSONObject request) { }
    }
    private final FrameStore store;
    FrameSync(FrameStore store) { this.store = store; }
    private static class ApiError extends IOException { final int status; ApiError(int status) { super("HTTP " + status); this.status = status; } }
    static void validateBase(String base) throws Exception {
        URL url = new URL(base);
        boolean debugLocal = BuildConfig.DEBUG && "http".equals(url.getProtocol()) && ("127.0.0.1".equals(url.getHost()) || "localhost".equals(url.getHost()));
        if (!("https".equals(url.getProtocol()) || debugLocal) || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null) throw new IOException("Secure origin required");
    }
    private HttpURLConnection connection(String base, String path, String token) throws Exception {
        validateBase(base);
        if (!path.startsWith("/api/") || path.contains("..")) throw new IOException("Invalid API path");
        HttpURLConnection connection = (HttpURLConnection) new URL(base + path).openConnection();
        connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json");
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        return connection;
    }
    private JSONObject json(String base, String path, String token, JSONObject payload) throws Exception {
        HttpURLConnection conn = connection(base, path, token);
        try {
            if (payload != null) {
                conn.setRequestMethod("POST"); conn.setDoOutput(true); conn.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = conn.getOutputStream()) { out.write(payload.toString().getBytes("UTF-8")); }
            }
            int status = conn.getResponseCode(); if (status < 200 || status >= 300) throw new ApiError(status);
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[16384]; int n;
                while ((n = in.read(buffer)) != -1) { out.write(buffer, 0, n); if (out.size() > 10 * 1024 * 1024) throw new IOException("Manifest too large"); }
                return new JSONObject(out.toString("UTF-8"));
            }
        } finally { conn.disconnect(); }
    }
    private static String digest(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) { byte[] bytes = new byte[16384]; int n; while ((n = in.read(bytes)) != -1) md.update(bytes, 0, n); }
        StringBuilder result = new StringBuilder(); for (byte b : md.digest()) result.append(String.format("%02x", b & 255)); return result.toString();
    }
    private void download(String base, String token, JSONObject photo) throws Exception {
        File destination = store.photo(photo.getString("id")); String expected = photo.getString("sha256");
        if (!expected.matches("[a-f0-9]{64}")) throw new IOException("Invalid checksum");
        if (destination.exists() && digest(destination).equals(expected)) return;
        if (store.photosDir.getUsableSpace() < 150L * 1024 * 1024) throw new IOException("storage_full");
        File temporary = new File(store.photosDir, photo.getString("id") + ".part");
        HttpURLConnection conn = connection(base, photo.getString("path"), token);
        try {
            int status = conn.getResponseCode(); if (status != 200) throw new ApiError(status);
            try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(temporary)) {
                byte[] bytes = new byte[16384]; int n; long total = 0;
                while ((n = in.read(bytes)) != -1) { total += n; if (total > 12 * 1024 * 1024) throw new IOException("Photo too large"); out.write(bytes, 0, n); }
                out.getFD().sync();
            }
            if (!digest(temporary).equals(expected)) throw new IOException("Checksum mismatch");
            if (!temporary.renameTo(destination)) throw new IOException("Cannot commit photo");
        } finally { temporary.delete(); conn.disconnect(); }
    }
    JSONObject realtimeSession() throws Exception {
        JSONObject credentials = store.credentials();
        if (credentials == null) throw new IOException("not_prepared");
        return json(credentials.getString("apiBase"), "/api/frame/realtime-session", credentials.getString("token"), new JSONObject());
    }
    void heartbeat() throws Exception {
        JSONObject credentials = store.credentials(); if (credentials == null) return;
        JSONObject current = store.manifest();
        android.content.SharedPreferences updates = FrameUpdater.prefs(store.context);
        json(credentials.getString("apiBase"), "/api/frame/heartbeat", credentials.getString("token"), new JSONObject()
            .put("cachedPhotos", current.optJSONArray("photos") == null ? 0 : current.getJSONArray("photos").length())
            .put("appVersion", BuildConfig.VERSION_NAME).put("appVersionCode", BuildConfig.VERSION_CODE)
            .put("managed", MosaDeviceAdmin.isOwner(store.context)).put("remoteUpdates", true)
            .put("realtimeState", store.context.getSharedPreferences("mosa", 0).getString("realtimeState", "not_started"))
            .put("updateRequestId", updates.getString("remoteRequestId", "")).put("updateState", updates.getString("state", "idle")));
    }
    void sync(Listener listener) {
        try {
            JSONObject credentials = store.credentials(); File provisioning = store.provisioningFile();
            if (provisioning != null) {
                JSONObject setup = new JSONObject(new String(FrameStore.read(provisioning), "UTF-8"));
                String base = setup.getString("apiBase").replaceAll("/+$", ""); validateBase(base);
                JSONObject enrolled = json(base, "/api/frame/enroll", null, new JSONObject().put("token", setup.getString("enrollmentToken")));
                enrolled.put("apiBase", base); enrolled.put("appUrl", setup.optString("appUrl", base));
                store.clearPhotos(); store.saveCredentials(enrolled); credentials = enrolled; provisioning.delete();
            }
            if (credentials == null) { listener.onError("not_prepared"); return; }
            String base = credentials.getString("apiBase"), token = credentials.getString("token");
            JSONObject previous = store.manifest(); String previousVersion = previous.optString("version", "");
            JSONObject next = json(base, "/api/frame/manifest" + (previousVersion.matches("[a-f0-9]{64}") ? "?version=" + previousVersion : ""), token, null);
            // An urgent fix must not wait for (or depend on) successful image downloads.
            listener.onUpdateRequest((next.optBoolean("unchanged") ? previous : next).optJSONObject("updateRequest"));
            if (next.optBoolean("unchanged")) {
                store.context.getSharedPreferences("mosa", 0).edit().putLong("lastSync", System.currentTimeMillis()).apply();
                heartbeat();
                listener.onComplete(previous, "up_to_date"); return;
            }
            JSONArray remotePhotos = next.getJSONArray("photos"); Set<String> allowed = new HashSet<>();
            for (int i = 0; i < remotePhotos.length(); i++) allowed.add(remotePhotos.getJSONObject(i).getString("id"));
            // Apply removals immediately after an authenticated manifest, even if a later new download fails.
            JSONArray retained = new JSONArray(); JSONArray oldPhotos = previous.optJSONArray("photos");
            if (oldPhotos != null) for (int i = 0; i < oldPhotos.length(); i++) { JSONObject p = oldPhotos.getJSONObject(i); if (allowed.contains(p.getString("id"))) retained.put(p); }
            previous.put("photos", retained); previous.remove("version"); store.saveManifest(previous);
            listener.onComplete(previous, "downloading");
            File[] existing = store.photosDir.listFiles(); if (existing != null) for (File file : existing) {
                String name = file.getName(); if (name.endsWith(".jpg") && !allowed.contains(name.substring(0, name.length() - 4))) file.delete();
            }
            long budget = 0; JSONArray available = new JSONArray();
            for (int i = 0; i < remotePhotos.length(); i++) {
                // Do not finish a large stale download list after a new removal signal.
                if (listener.needsRefresh()) { listener.onComplete(store.manifest(), "refresh_needed"); return; }
                JSONObject photo = remotePhotos.getJSONObject(i); budget += Math.max(0, photo.optLong("bytes"));
                if (budget > 5L * 1024 * 1024 * 1024) break;
                download(base, token, photo); available.put(photo);
                // Checkpoint each verified photo. An interrupted first connection still leaves usable photos.
                JSONObject checkpoint = new JSONObject(next.toString()); checkpoint.remove("version"); checkpoint.put("photos", available); store.saveManifest(checkpoint);
            }
            next.put("photos", available); store.saveManifest(next);
            Set<String> kept = new HashSet<>();
            for (int i = 0; i < available.length(); i++) kept.add(available.getJSONObject(i).getString("id") + ".jpg");
            File[] cached = store.photosDir.listFiles(); if (cached != null) for (File file : cached) if (file.getName().endsWith(".jpg") && !kept.contains(file.getName())) file.delete();
            store.context.getSharedPreferences("mosa", 0).edit().putLong("lastSync", System.currentTimeMillis()).apply();
            heartbeat();
            listener.onComplete(next, "up_to_date");
        } catch (ApiError e) {
            if ((e.status == 401 || e.status == 403) && store.provisioningFile() == null) { store.revoke(); listener.onError("access_revoked"); }
            else listener.onError(e.status == 401 ? "setup_expired" : "offline");
        } catch (Exception e) { listener.onError("storage_full".equals(e.getMessage()) ? "storage_full" : "offline"); }
    }
}
