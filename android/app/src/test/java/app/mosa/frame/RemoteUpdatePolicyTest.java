package app.mosa.frame;
import org.junit.Test;
import static org.junit.Assert.*;

public class RemoteUpdatePolicyTest {
    private final String id = "1234567890abcdef1234567890abcdef";
    @Test public void queuedCommandIsAcceptedWhenFrameReconnectsBeforeExpiry() {
        assertTrue(RemoteUpdatePolicy.accept(id, "", 15, 2000, 1000));
    }
    @Test public void reconnectOrRestartCannotReplayAnAlreadyHandledCommand() {
        assertFalse(RemoteUpdatePolicy.accept(id, id, 15, 2000, 1000));
    }
    @Test public void expiredOrMalformedCommandIsIgnored() {
        assertFalse(RemoteUpdatePolicy.accept(id, "", 15, 999, 1000));
        assertFalse(RemoteUpdatePolicy.accept("", "", 15, 2000, 1000));
        assertFalse(RemoteUpdatePolicy.accept(id, "", 0, 2000, 1000));
    }
}
