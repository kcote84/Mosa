package app.mosa.frame;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class UpdateReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!"app.mosa.frame.MIDNIGHT_UPDATE".equals(action) && !Intent.ACTION_TIME_CHANGED.equals(action) && !Intent.ACTION_TIMEZONE_CHANGED.equals(action)) return;
        UpdateScheduler.schedule(context);
        UpdateScheduler.checkIfDue(context);
    }
}
