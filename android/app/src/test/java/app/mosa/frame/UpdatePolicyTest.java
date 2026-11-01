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
    @Test public void automaticInstallationIsNightOnlyManagedAndNotDuringUse() {
        long midnight = at("2026-11-01T04:00:00Z");
        assertTrue(UpdatePolicy.automaticAllowed(midnight, "America/Toronto", true, 0, 9, 0, 0, false));
        assertFalse(UpdatePolicy.automaticAllowed(midnight, "America/Toronto", false, 0, 9, 0, 0, true));
        assertFalse(UpdatePolicy.automaticAllowed(midnight, "America/Toronto", true, midnight - 1000, 9, 0, 0, false));
        assertFalse(UpdatePolicy.automaticAllowed(at("2026-11-01T10:00:00Z"), "America/Toronto", true, 0, 9, 0, 0, false));
        assertFalse(UpdatePolicy.automaticAllowed(midnight - 1000, "America/Toronto", true, 0, 9, 0, 0, false));
        assertTrue(UpdatePolicy.automaticAllowed(at("2026-11-01T18:00:00Z"), "America/Toronto", true, 0, 9, 0, 0, true));
    }
    @Test public void failedAutomaticInstallDoesNotLoopButCanRetryNextNight() {
        long midnight = at("2026-11-01T04:00:00Z");
        assertFalse(UpdatePolicy.automaticAllowed(midnight + 600000, "America/Toronto", true, 0, 9, 9, midnight, false));
        assertTrue(UpdatePolicy.automaticAllowed(at("2026-11-02T05:00:00Z"), "America/Toronto", true, 0, 9, 9, midnight, false));
    }
    @Test public void nightCoverIsCorrectAtStartupAndAtBothEdges() {
        assertTrue(UpdatePolicy.night(at("2026-11-01T03:00:00Z"), "America/Toronto", true, "23:00", "05:00"));
        assertTrue(UpdatePolicy.night(at("2026-11-01T09:59:59Z"), "America/Toronto", true, "23:00", "05:00"));
        assertFalse(UpdatePolicy.night(at("2026-11-01T10:00:00Z"), "America/Toronto", true, "23:00", "05:00"));
        assertFalse(UpdatePolicy.night(at("2026-11-01T04:00:00Z"), "America/Toronto", false, "23:00", "05:00"));
        assertFalse(UpdatePolicy.night(at("2026-11-01T04:00:00Z"), "America/Toronto", true, "bad", "05:00"));
    }
}
