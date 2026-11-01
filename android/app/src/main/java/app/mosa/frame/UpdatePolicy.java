package app.mosa.frame;

import java.time.Instant;
import java.time.ZoneId;

/** Calendar days, not 24-hour intervals: midnight stays correct across DST changes. */
final class UpdatePolicy {
    static final long MAX_BYTES = 40L * 1024 * 1024;
    static final long RETRY_MS = 15L * 60 * 1000;
    static long nextMidnight(long now, String zone) {
        ZoneId id = ZoneId.of(zone);
        return Instant.ofEpochMilli(now).atZone(id).toLocalDate().plusDays(1).atStartOfDay(id).toInstant().toEpochMilli();
    }
    static String day(long time, String zone) { return Instant.ofEpochMilli(time).atZone(ZoneId.of(zone)).toLocalDate().toString(); }
    static boolean due(long now, long lastSuccess, long lastAttempt, String zone) {
        boolean today = lastSuccess > 0 && day(lastSuccess, zone).equals(day(now, zone));
        return !today && (lastAttempt == 0 || lastAttempt > now || !day(lastAttempt, zone).equals(day(now, zone)) || now - lastAttempt >= RETRY_MS);
    }
    static boolean validRelease(int code, String name, long bytes, String sha, String path, int minSdk, int sdk) {
        return code > 0 && name.matches("[0-9]+\\.[0-9]+\\.[0-9]+") && bytes > 0 && bytes <= MAX_BYTES
            && sha.matches("[a-f0-9]{64}") && path.equals("/updates/mosa-frame-" + code + "-" + sha + ".apk")
            && minSdk >= 27 && minSdk <= sdk;
    }
    static boolean automaticAllowed(long now, String zone, boolean managed, long lastInteraction, int version, int attemptedVersion, long attemptedAt, boolean forceNow) {
        if (!managed || version <= 0) return false;
        if (forceNow) return true; // Explicit USB maintenance or an authenticated admin push.
        int hour = Instant.ofEpochMilli(now).atZone(ZoneId.of(zone)).getHour();
        boolean quiet = lastInteraction <= 0 || lastInteraction > now || now - lastInteraction >= 5 * 60 * 1000L;
        boolean alreadyTried = attemptedVersion == version && attemptedAt > 0 && day(attemptedAt, zone).equals(day(now, zone));
        return hour < 5 && quiet && !alreadyTried;
    }
    static boolean night(long now, String zone, boolean enabled, String start, String end) {
        if (!enabled) return false;
        try {
            java.time.LocalTime a = java.time.LocalTime.parse(start), b = java.time.LocalTime.parse(end);
            java.time.LocalTime current = Instant.ofEpochMilli(now).atZone(ZoneId.of(zone)).toLocalTime();
            return !a.equals(b) && (a.isBefore(b) ? !current.isBefore(a) && current.isBefore(b) : !current.isBefore(a) || current.isBefore(b));
        } catch (Exception ignored) { return false; }
    }
}
