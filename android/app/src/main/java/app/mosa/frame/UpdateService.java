package app.mosa.frame;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.os.PowerManager;

/** Quiet check and, on managed frames, installation without opening confirmation screens. */
public final class UpdateService extends Service {
    static volatile boolean running;
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel("mosa-updates", "Mosa", NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null); manager.createNotificationChannel(channel);
        boolean en = "en".equals(getSharedPreferences("mosa", MODE_PRIVATE).getString("locale", "fr"));
        Intent open = new Intent(this, MainActivity.class).putExtra("showUpdates", true);
        PendingIntent pending = PendingIntent.getActivity(this, 20, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        startForeground(20, new Notification.Builder(this, "mosa-updates").setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(en ? "Checking Mosa updates" : "Recherche des mises à jour Mosa").setContentIntent(pending).setOngoing(true).build());
        if (running) return START_NOT_STICKY;
        if ("installing".equals(FrameUpdater.prefs(this).getString("state", ""))) { stopForeground(true); stopSelf(); return START_NOT_STICKY; }
        running = true;
        final boolean installNow = intent != null && intent.getBooleanExtra("installNow", false);
        new Thread(() -> {
            PowerManager.WakeLock lock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Mosa:Update");
            lock.acquire(10 * 60 * 1000L);
            try {
                FrameUpdater updater = new FrameUpdater(this); updater.check();
                if (installNow) report();
                updater.installAutomatically(installNow);
                if (installNow) report();
            }
            finally { if (lock.isHeld()) lock.release(); running = false; stopForeground(true); stopSelf(); }
        }, "Mosa update").start();
        return START_NOT_STICKY;
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    private void report() { try { new FrameSync(new FrameStore(this)).heartbeat(); } catch (Exception ignored) { } }
}
