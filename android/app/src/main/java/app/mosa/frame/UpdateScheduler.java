package app.mosa.frame;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONObject;

final class UpdateScheduler {
    static String zone(Context context) {
        JSONObject settings = new FrameStore(context).manifest().optJSONObject("settings");
        return settings == null ? "America/Toronto" : settings.optString("timeZone", "America/Toronto");
    }
    static void schedule(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent alarm = PendingIntent.getBroadcast(context, 20, new Intent(context, UpdateReceiver.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long next = UpdatePolicy.nextMidnight(System.currentTimeMillis(), zone(context));
        if (Build.VERSION.SDK_INT >= 31 && !alarms.canScheduleExactAlarms()) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarm);
        else alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarm);
    }
    static void checkIfDue(Context context) {
        android.content.SharedPreferences prefs = FrameUpdater.prefs(context);
        if (UpdatePolicy.due(System.currentTimeMillis(), prefs.getLong("lastSuccess", 0), prefs.getLong("lastAttempt", 0), zone(context))) start(context);
    }
    static void start(Context context) { context.startForegroundService(new Intent(context, UpdateService.class)); }
}
