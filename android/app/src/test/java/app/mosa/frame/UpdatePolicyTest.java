package app.mosa.frame;

import org.junit.Test;
import static org.junit.Assert.*;
import java.time.Instant;

public class UpdatePolicyTest {
    private long at(String date) { return Instant.parse(date).toEpochMilli(); }
    @Test public void midnightFollowsTorontoEvenIfDeviceUsesAnotherZone() {
        assertEquals(at("2026-11-01T04:00:00Z"), UpdatePolicy.nextMidnight(at("2026-10-31T22:00:00Z"), "America/Toronto"));
    }
    @Test public void fallAndSpringTimeChangesDoNotShiftMidnight() {
        assertEquals(at("2026-11-02T05:00:00Z"), UpdatePolicy.nextMidnight(at("2026-11-01T04:00:00Z"), "America/Toronto"));
        assertEquals(at("2026-03-09T04:00:00Z"), UpdatePolicy.nextMidnight(at("2026-03-08T05:00:00Z"), "America/Toronto"));
    }
    @Test public void offlineRetryAndMissedMidnightCatchUpWithoutLooping() {
        long now = at("2026-11-01T12:00:00Z");
        assertTrue(UpdatePolicy.due(now, now - 86400000, 0, "America/Toronto"));
        assertFalse(UpdatePolicy.due(now, now - 10000, 0, "America/Toronto"));
        assertFalse(UpdatePolicy.due(now, 0, now - 1000, "America/Toronto"));
        assertTrue(UpdatePolicy.due(now, 0, now - UpdatePolicy.RETRY_MS, "America/Toronto"));
        assertTrue(UpdatePolicy.due(now, 0, now + 3600000, "America/Toronto"));
        long midnight = at("2026-11-01T04:00:00Z");
        assertTrue(UpdatePolicy.due(midnight, 0, midnight - 60000, "America/Toronto"));
    }
    @Test public void onlyVersionedSameOriginArtifactsAreAccepted() {
        String sha = new String(new char[64]).replace('\0', 'a');
        String path = "/updates/mosa-frame-6-" + sha + ".apk";
        assertTrue(UpdatePolicy.validRelease(6, "0.2.1", 1000000, sha, path, 27, 27));
        assertFalse(UpdatePolicy.validRelease(6, "0.2.1", 1000000, sha, "https://example.com/a.apk", 27, 27));
        assertFalse(UpdatePolicy.validRelease(6, "0.2.1", 1000000, sha, path + "?redirect=x", 27, 27));
        assertFalse(UpdatePolicy.validRelease(6, "0.2.1", UpdatePolicy.MAX_BYTES + 1, sha, path, 27, 27));
        assertFalse(UpdatePolicy.validRelease(6, "0.2.1", 1000000, sha, path, 28, 27));
    }
}
