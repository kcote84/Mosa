package app.mosa.frame;
import org.junit.Test;
import static org.junit.Assert.*;

public class SyncGateTest {
    @Test public void removalDuringDownloadTriggersOneTrailingSync() {
        SyncGate gate = new SyncGate();
        assertTrue(gate.begin());
        assertFalse(gate.begin());
        assertFalse(gate.begin());
        assertTrue(gate.finish());
        assertTrue(gate.begin());
        assertFalse(gate.finish());
    }
    @Test public void noChangeDoesNotCauseAnEndlessSyncLoop() {
        SyncGate gate = new SyncGate();
        assertTrue(gate.begin()); assertFalse(gate.finish());
        assertTrue(gate.begin()); assertFalse(gate.finish());
    }
}
