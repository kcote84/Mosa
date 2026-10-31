package app.mosa.frame;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;

/** A visible escape from the vendor's Wi-Fi settings, which have no navigation controls. */
public final class WifiReturnService extends Service {
    private WindowManager windows;
    private Button back;
    private static final String CHANNEL = "mosa-wifi-return";
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private Intent photos() { return new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP); }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        boolean english = "en".equals(getSharedPreferences("mosa", MODE_PRIVATE).getString("locale", "fr"));
        String label = english ? "← Back to photos" : "← Revenir aux photos";
        NotificationManager notifications = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Mosa Wi-Fi", NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null); notifications.createNotificationChannel(channel);
        PendingIntent returnIntent = PendingIntent.getActivity(this, 0, photos(), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        startForeground(10, new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_revert)
            .setContentTitle(label).setContentText("Mosa").setContentIntent(returnIntent).setOngoing(true).build());
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        if (back == null) {
            windows = getSystemService(WindowManager.class);
            back = new Button(this); back.setAllCaps(false); back.setTextSize(18); back.setTypeface(Typeface.DEFAULT_BOLD);
            back.setTextColor(Color.WHITE); back.setPadding(dp(20), 0, dp(20), 0);
            GradientDrawable background = new GradientDrawable(); background.setColor(Color.rgb(32,94,135)); background.setCornerRadius(dp(12)); back.setBackground(background);
            back.setElevation(dp(6));
            WindowManager.LayoutParams p = new WindowManager.LayoutParams(-2, dp(54), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT);
            p.gravity = Gravity.TOP | Gravity.RIGHT; p.x = dp(14); p.y = dp(5);
            back.setOnClickListener(v -> { startActivity(photos()); stopSelf(); });
            try { windows.addView(back, p); } catch (RuntimeException e) { back = null; stopSelf(); }
        }
        if (back != null) { back.setText(label); back.setContentDescription(label); }
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() { if (back != null && windows != null) { try { windows.removeView(back); } catch (RuntimeException ignored) {} back = null; } stopForeground(true); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
