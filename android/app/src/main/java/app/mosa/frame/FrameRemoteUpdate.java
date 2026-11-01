package app.mosa.frame;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;

/** Accepts only a command received inside an authenticated, fresh API manifest. */
final class FrameRemoteUpdate {
    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    FrameRemoteUpdate(Context context) { this.context = context.getApplicationContext(); }
    void accept(JSONObject command) {
        handler.removeCallbacksAndMessages(null);
        if (command == null) return;
        SharedPreferences prefs = FrameUpdater.prefs(context);
        String id = command.optString("id");
        if (!RemoteUpdatePolicy.accept(id, prefs.getString("remoteRequestId", ""), command.optInt("targetVersion"), command.optLong("expiresAt"), System.currentTimeMillis())) return;
        if (UpdateService.running || "installing".equals(prefs.getString("state", ""))) {
            handler.postDelayed(() -> accept(command), 5000); return;
        }
        // Persist before replacement can kill the app. Reconnecting cannot replay the command.
        if (!prefs.edit().putString("remoteRequestId", id).commit()) return;
        try { context.startForegroundService(new Intent(context, UpdateService.class).putExtra("installNow", true)); }
        catch (Exception e) { prefs.edit().remove("remoteRequestId").apply(); }
    }
    void stop() { handler.removeCallbacksAndMessages(null); }
}
