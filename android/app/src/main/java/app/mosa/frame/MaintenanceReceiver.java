package app.mosa.frame;

import android.app.admin.DevicePolicyManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Local USB maintenance only. The signature-level DUMP permission excludes ordinary apps. */
public final class MaintenanceReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            String action = intent.getAction();
            if ("app.mosa.frame.CHECK_UPDATES".equals(action)) {
                context.startForegroundService(new Intent(context, UpdateService.class).putExtra("installNow", intent.getBooleanExtra("installNow", false)));
                setResultData("Update check requested");
            } else if ("app.mosa.frame.RELEASE_MANAGEMENT".equals(action)) {
                if (MosaDeviceAdmin.isOwner(context)) context.getSystemService(DevicePolicyManager.class).clearDeviceOwnerApp(context.getPackageName());
                setResultData("Device ownership removed; photos retained");
            } else if ("app.mosa.frame.UPDATE_STATUS".equals(action)) {
                SharedPreferences p = FrameUpdater.prefs(context);
                JSONObject manifest = new FrameStore(context).manifest();
                setResultData(new JSONObject().put("version", BuildConfig.VERSION_NAME).put("versionCode", BuildConfig.VERSION_CODE)
                    .put("managed", MosaDeviceAdmin.isOwner(context)).put("state", p.getString("state", "idle"))
                    .put("lastCheck", p.getLong("lastSuccess", 0)).put("lastInstallStatus", p.getInt("lastInstallStatus", -999))
                    .put("automaticAttemptVersion", p.getInt("automaticAttemptVersion", 0)).put("automaticAttemptAt", p.getLong("automaticAttemptAt", 0))
                    .put("photoCount", manifest.optJSONArray("photos") == null ? 0 : manifest.getJSONArray("photos").length())
                    .put("night", FrameNight.active(context, System.currentTimeMillis())).toString());
            } else { setResultCode(1); return; }
            setResultCode(0);
        } catch (Exception e) { setResultCode(1); setResultData(e.getClass().getSimpleName()); }
    }
}
