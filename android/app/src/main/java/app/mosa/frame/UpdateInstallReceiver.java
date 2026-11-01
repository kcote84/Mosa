package app.mosa.frame;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

public final class UpdateInstallReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1) != FrameUpdater.prefs(context).getInt("sessionId", -2)) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        boolean automatic = FrameUpdater.prefs(context).getBoolean("automaticSession", false);
        FrameUpdater.prefs(context).edit().putInt("lastInstallStatus", status).apply();
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            if (automatic) {
                // A firmware that still requires consent must never open a screen at night.
                try { context.getPackageManager().getPackageInstaller().abandonSession(intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)); } catch (Exception ignored) { }
                FrameUpdater.state(context, "ready"); return;
            }
            Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmation != null) { confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(confirmation); }
        } else {
            FrameUpdater.state(context, status == PackageInstaller.STATUS_SUCCESS ? "up_to_date" : "ready");
            if (status == PackageInstaller.STATUS_SUCCESS || !automatic) context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("afterUpdate", status == PackageInstaller.STATUS_SUCCESS).putExtra("showUpdates", status != PackageInstaller.STATUS_SUCCESS));
        }
    }
}
