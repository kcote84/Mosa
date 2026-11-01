package app.mosa.frame;

import android.content.Context;
import org.json.JSONObject;

final class FrameNight {
    static boolean active(Context context, long now) { return active(new FrameStore(context).manifest(), now); }
    static boolean active(JSONObject manifest, long now) {
        JSONObject settings = manifest == null ? null : manifest.optJSONObject("settings");
        return UpdatePolicy.night(now, settings == null ? "America/Toronto" : settings.optString("timeZone", "America/Toronto"),
            settings == null || settings.optBoolean("nightEnabled", true), settings == null ? "23:00" : settings.optString("nightStart", "23:00"), settings == null ? "05:00" : settings.optString("nightEnd", "05:00"));
    }
}
