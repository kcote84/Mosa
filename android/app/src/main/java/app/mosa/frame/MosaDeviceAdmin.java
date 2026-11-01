package app.mosa.frame;

import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.Context;

/** Device ownership is enabled explicitly over USB during frame preparation. */
public final class MosaDeviceAdmin extends DeviceAdminReceiver {
    static boolean isOwner(Context context) {
        DevicePolicyManager manager = context.getSystemService(DevicePolicyManager.class);
        return manager != null && manager.isDeviceOwnerApp(context.getPackageName());
    }
}
