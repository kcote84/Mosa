package app.mosa.frame;

final class RemoteUpdatePolicy {
    static boolean accept(String id, String handled, int target, long expiresAt, long now) {
        return id.matches("[a-f0-9]{32}") && !id.equals(handled) && target > 0 && expiresAt > now;
    }
}
