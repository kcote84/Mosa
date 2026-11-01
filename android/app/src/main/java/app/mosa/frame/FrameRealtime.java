package app.mosa.frame;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreSettings;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MemoryCacheSettings;
import com.google.firebase.firestore.MetadataChanges;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** A small private change signal; photos continue to use the authenticated API. */
final class FrameRealtime {
    private final FrameStore store;
    private final Runnable changed;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private ListenerRegistration listener;
    private FirebaseAuth auth;
    private FirebaseFirestore database;
    private boolean stopped, connecting;
    private int generation, failures;
    private long nextAttempt;
    private final Runnable retry = this::ensureConnected;

    FrameRealtime(FrameStore store, Runnable changed) { this.store = store; this.changed = changed; }

    // Called on the main thread. The SDK handles transient network loss itself.
    void ensureConnected() {
        if (stopped || connecting || listener != null || SystemClock.elapsedRealtime() < nextAttempt) return;
        handler.removeCallbacks(retry);
        try { if (store.credentials() == null) return; } catch (Exception e) { return; }
        connecting = true;
        final int attempt = ++generation;
        state("connecting");
        worker.execute(() -> {
            try {
                JSONObject session = new FrameSync(store).realtimeSession();
                handler.post(() -> authenticate(session, attempt));
            } catch (Exception e) { handler.post(() -> failed(attempt)); }
        });
    }

    private void authenticate(JSONObject session, int attempt) {
        if (stopped || attempt != generation) return;
        try {
            if (auth == null) {
                JSONObject config = session.getJSONObject("firebase");
                FirebaseApp app; boolean created = false;
                try { app = FirebaseApp.getInstance("mosa-realtime"); }
                catch (IllegalStateException e) {
                    app = FirebaseApp.initializeApp(store.context.getApplicationContext(), new FirebaseOptions.Builder()
                        .setProjectId(config.getString("projectId")).setApiKey(config.getString("apiKey"))
                        .setApplicationId(config.getString("appId")).build(), "mosa-realtime");
                    created = true;
                }
                auth = FirebaseAuth.getInstance(app);
                database = FirebaseFirestore.getInstance(app);
                if (created) database.setFirestoreSettings(new FirebaseFirestoreSettings.Builder()
                    .setLocalCacheSettings(MemoryCacheSettings.newBuilder().build()).build());
            }
            final String householdId = session.getString("householdId");
            auth.signInWithCustomToken(session.getString("customToken")).addOnCompleteListener(task -> {
                if (stopped || attempt != generation) return;
                if (!task.isSuccessful()) { failed(attempt); return; }
                connecting = false;
                listener = database.collection("albumSignals").document(householdId)
                    .addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, error) -> {
                        if (stopped || attempt != generation) return;
                        if (error != null) { failed(attempt); return; }
                        // A cached snapshot cannot establish current access or trigger a fresh sync.
                        if (snapshot == null || snapshot.getMetadata().isFromCache()) return;
                        failures = 0; state("connected");
                        store.context.getSharedPreferences("mosa", 0).edit().putLong("lastRealtimeSignal", System.currentTimeMillis()).apply();
                        changed.run();
                    });
            });
        } catch (Exception e) { failed(attempt); }
    }

    private void failed(int attempt) {
        if (stopped || attempt != generation) return;
        if (listener != null) { listener.remove(); listener = null; }
        connecting = false; ++generation;
        state("retrying");
        // Check revocation through the API as well; it clears local access when needed.
        changed.run();
        long delay = Math.min(300000L, 5000L * (1L << Math.min(failures++, 6)));
        nextAttempt = SystemClock.elapsedRealtime() + delay;
        handler.removeCallbacks(retry); handler.postDelayed(retry, delay);
    }

    void stop() {
        stopped = true; ++generation; handler.removeCallbacksAndMessages(null);
        if (listener != null) { listener.remove(); listener = null; }
        worker.shutdownNow(); state("stopped");
    }
    private void state(String value) { store.context.getSharedPreferences("mosa", 0).edit().putString("realtimeState", value).apply(); }
}
