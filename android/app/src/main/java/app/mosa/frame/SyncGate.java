package app.mosa.frame;

/** One sync at a time, with one trailing sync if a change arrives during a download. */
final class SyncGate {
    private boolean running, pending;
    synchronized boolean begin() {
        if (running) { pending = true; return false; }
        running = true; return true;
    }
    synchronized boolean finish() {
        running = false;
        boolean again = pending; pending = false;
        return again;
    }
    synchronized boolean hasPending() { return pending; }
}
