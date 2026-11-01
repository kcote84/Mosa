package app.mosa.frame;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.text.DateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int GREEN = Color.rgb(23,62,49), CREAM = Color.rgb(255,248,239), MUTED = Color.rgb(106,122,99);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor(), images = Executors.newSingleThreadExecutor();
    private final SyncGate syncing = new SyncGate();
    private FrameRealtime realtime;
    private FrameRemoteUpdate remoteUpdate;
    private FrameStore store; private JSONObject manifest; private SharedPreferences preferences;
    private FrameLayout root; private PhotoDisplay photoView; private LinearLayout welcome, controls; private View nightCover;
    private JSONArray photos = new JSONArray(); private int index = 0; private long imageGeneration = 0, awakeUntil = 0;
    private boolean alive = true, splash = true; private String status = "starting";
    private ConnectivityManager connectivity; private ConnectivityManager.NetworkCallback networkCallback;
    private final Runnable advance = new Runnable() { @Override public void run() { if (photos.length() > 0) { index = (index + 1) % photos.length(); showPhoto(); } scheduleSlide(); } };
    private final Runnable periodicSync = this::synchronize;
    private final Runnable nightTick = new Runnable() { @Override public void run() { applyNight(); handler.postDelayed(this, 30000); } };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state); store = new FrameStore(this); preferences = getSharedPreferences("mosa", MODE_PRIVATE);
        manifest = store.manifest();
        realtime = new FrameRealtime(store, this::synchronize);
        remoteUpdate = new FrameRemoteUpdate(this);
        boolean afterUpdate = getIntent().getBooleanExtra("afterUpdate", false) || FrameUpdater.prefs(this).getInt("lastRunningVersion", BuildConfig.VERSION_CODE) != BuildConfig.VERSION_CODE;
        FrameUpdater.prefs(this).edit().putInt("lastRunningVersion", BuildConfig.VERSION_CODE).apply();
        new FrameUpdater(this).reconcile();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); immersive();
        if (FrameNight.active(manifest, System.currentTimeMillis())) { WindowManager.LayoutParams p = getWindow().getAttributes(); p.screenBrightness = 0.01f; getWindow().setAttributes(p); }
        root = new FrameLayout(this); root.setBackgroundColor(Color.BLACK); setContentView(root);
        photoView = new PhotoDisplay(this); root.addView(photoView, fill()); photoView.setOnClickListener(v -> toggleControls());
        nightCover = new View(this); nightCover.setBackgroundColor(Color.BLACK); nightCover.setVisibility(View.GONE); root.addView(nightCover, fill());
        nightCover.setOnClickListener(v -> { awakeUntil = System.currentTimeMillis() + 60000; applyNight(); showControls(); });
        if (afterUpdate) { splash = false; loadManifest(manifest); handler.post(this::synchronize); }
        else { showWelcome(true); handler.postDelayed(() -> { splash = false; loadManifest(store.manifest()); synchronize(); }, 2200); }
        handler.post(nightTick);
        UpdateScheduler.schedule(this);
        UpdateScheduler.checkIfDue(this);
        if (!afterUpdate && getIntent().getBooleanExtra("showUpdates", false)) handler.postDelayed(() -> new UpdateDialog(this).show(), 2500);
        connectivity = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        networkCallback = new ConnectivityManager.NetworkCallback() { @Override public void onAvailable(Network n) { handler.postDelayed(() -> { if (!splash) { synchronize(); UpdateScheduler.checkIfDue(MainActivity.this); } }, 2500); } };
        try { connectivity.registerDefaultNetworkCallback(networkCallback); } catch (Exception ignored) { }
    }
    private FrameLayout.LayoutParams fill() { return new FrameLayout.LayoutParams(-1, -1); }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private String t(String fr, String en) { return "en".equals(preferences.getString("locale", "fr")) ? en : fr; }
    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = new TextView(this); view.setText(text); view.setTextSize(size); view.setTextColor(color); view.setGravity(Gravity.CENTER);
        if (bold) view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); return view;
    }
    private Button button(String text, Runnable action) {
        Button b = new Button(this); b.setText(text); b.setAllCaps(false); b.setTextSize(16); b.setTextColor(GREEN);
        GradientDrawable background = new GradientDrawable(); background.setColor(Color.rgb(237,240,226)); background.setCornerRadius(dp(12)); background.setStroke(dp(1), Color.rgb(210,221,199)); b.setBackground(background); b.setPadding(dp(18), 0, dp(18), 0);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dp(54)); p.setMargins(dp(6), 0, dp(6), 0); b.setLayoutParams(p);
        b.setOnClickListener(v -> action.run()); return b;
    }
    private Button languageButton() {
        Button b = button(t("ENGLISH", "FRANÇAIS"), this::toggleLanguage);
        GradientDrawable background = new GradientDrawable(); background.setColor(Color.rgb(32,94,135)); background.setCornerRadius(dp(12)); b.setBackground(background);
        b.setTextColor(Color.WHITE); b.setTextSize(18); b.setTypeface(Typeface.DEFAULT_BOLD); b.setMinWidth(dp(155));
        b.setContentDescription(t("Switch to English", "Passer en français")); return b;
    }
    private LinearLayout buttonRow(Button... buttons) {
        LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER);
        for (Button b : buttons) {
            b.setMinWidth(0); b.setMinimumWidth(0); b.setPadding(dp(10), 0, dp(10), 0); b.setSingleLine(true);
            int textSize = Math.round(b.getTextSize() / getResources().getDisplayMetrics().scaledDensity);
            b.setAutoSizeTextTypeUniformWithConfiguration(14, Math.max(14, textSize), 1, android.util.TypedValue.COMPLEX_UNIT_SP);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(54), 1f); p.setMargins(dp(4), 0, dp(4), 0);
            row.addView(b, p);
        }
        return row;
    }
    private String householdName() {
        if (manifest != null && !manifest.optString("householdName").isEmpty()) return manifest.optString("householdName");
        try { JSONObject credentials = store.credentials(); if (credentials != null) return credentials.optString("householdName", "Mosa"); } catch (Exception ignored) { }
        return "Mosa";
    }
    private void showWelcome(boolean startup) {
        if (welcome != null) root.removeView(welcome);
        welcome = new LinearLayout(this); welcome.setOrientation(LinearLayout.VERTICAL); welcome.setGravity(Gravity.CENTER); welcome.setPadding(dp(25), dp(15), dp(25), dp(15)); welcome.setBackgroundColor(CREAM);
        ImageView mascot = new ImageView(this); mascot.setImageResource(R.drawable.mascot); mascot.setScaleType(ImageView.ScaleType.FIT_CENTER);
        welcome.addView(mascot, new LinearLayout.LayoutParams(dp(startup ? 200 : 160), dp(startup ? 200 : 160)));
        welcome.addView(label("Mosa", startup ? 56 : 44, GREEN, true));
        welcome.addView(label("Nos moments, chez vous.", 23, GREEN, true));
        welcome.addView(label("Our moments, in your home.", 19, MUTED, false));
        if (startup) {
            LinearLayout languages = new LinearLayout(this); languages.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.topMargin = dp(24); languages.addView(languageButton()); welcome.addView(languages, lp);
        }
        if (!startup) {
            TextView home = label(householdName(), 20, GREEN, true); LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(-1, -2); hp.topMargin = dp(20); welcome.addView(home, hp);
            TextView message = label(statusMessage(), 17, MUTED, false); LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(-1, -2); mp.topMargin = dp(8); welcome.addView(message, mp);
            LinearLayout buttons = buttonRow(
                button(t("Connecter le Wi-Fi", "Connect Wi-Fi"), this::openWifi),
                button(t("L’app sur mon téléphone", "App on my phone"), this::showQr),
                button(t("Mises à jour", "Updates"), () -> new UpdateDialog(this).show()), languageButton());
            LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, -2); bp.topMargin = dp(20);
            welcome.addView(buttons, bp);
        }
        root.addView(welcome, fill()); nightCover.bringToFront(); applyNight();
    }
    private String statusMessage() {
        if ("access_revoked".equals(status)) return t("L’accès de ce cadre a été retiré. Contactez Kev.", "This frame’s access was removed. Contact Kev.");
        if ("not_prepared".equals(status) || "setup_expired".equals(status)) return t("Ce cadre attend sa préparation par Kev.", "This frame is waiting for Kev to prepare it.");
        if ("storage_full".equals(status)) return t("L’espace est presque plein. Les photos déjà reçues restent disponibles.", "Storage is almost full. Previously received photos remain available.");
        if ("offline".equals(status)) return t("Connectez le Wi-Fi. Vos photos vous attendent.", "Connect to Wi-Fi. Your photos are waiting for you.");
        if ("downloading".equals(status) || "starting".equals(status)) return t("On rassemble les souvenirs…", "Gathering your memories…");
        return t("Tout est prêt. Les prochains souvenirs arriveront ici.", "All ready. Your next memories will arrive here.");
    }
    private void toggleLanguage() {
        preferences.edit().putString("locale", "en".equals(preferences.getString("locale", "fr")) ? "fr" : "en").apply();
        if (photos.length() == 0) showWelcome(false); if (controls != null) showControls();
    }
    private void loadManifest(JSONObject value) {
        manifest = value; JSONArray incoming = value.optJSONArray("photos"); photos = incoming == null ? new JSONArray() : incoming;
        UpdateScheduler.schedule(this);
        UpdateScheduler.checkIfDue(this);
        JSONObject settings = value.optJSONObject("settings");
        if (settings != null) {
            String remoteLang = settings.optString("locale", "fr");
            String lastRemote = preferences.getString("serverLocale", "");
            if (!remoteLang.equals(lastRemote)) {
                SharedPreferences.Editor edit = preferences.edit().putString("serverLocale", remoteLang);
                if (!lastRemote.isEmpty() || !preferences.contains("locale")) edit.putString("locale", remoteLang);
                edit.apply();
            }
        }
        Set<String> allowedIds = new HashSet<>();
        String displayedId = photoView.currentId(); int retainedIndex = -1;
        for (int i = 0; i < photos.length(); i++) {
            JSONObject photo = photos.optJSONObject(i); if (photo == null) continue;
            String id = photo.optString("id"); allowedIds.add(id); if (id.equals(displayedId)) retainedIndex = i;
        }
        if (retainedIndex >= 0) index = retainedIndex; else if (index >= photos.length()) index = 0;
        // Invalidate decoders and removed layers immediately, but keep an unchanged photo visible during sync.
        ++imageGeneration; photoView.retain(allowedIds);
        if (photos.length() == 0) showWelcome(false); else { if (welcome != null) { root.removeView(welcome); welcome = null; } showPhoto(); }
        if (controls != null) showControls(); scheduleSlide(); applyNight();
    }
    private void showPhoto() {
        if (photos.length() == 0 || !alive) return;
        try {
            JSONObject photo = photos.getJSONObject(index); final String id = photo.getString("id"); File file = store.photo(id);
            final long generation = ++imageGeneration; final boolean cover = "cover".equals(photo.optString("fit"));
            if (photoView.isShowing(id, cover)) return;
            images.execute(() -> {
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true; BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inPreferredConfig = Bitmap.Config.RGB_565; options.inSampleSize = 1;
                while (bounds.outWidth / (options.inSampleSize * 2) >= 1280 && bounds.outHeight / (options.inSampleSize * 2) >= 800) options.inSampleSize *= 2;
                Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
                handler.post(() -> { if (!alive || generation != imageGeneration || bitmap == null) return; photoView.show(bitmap, id, cover); });
            });
        } catch (Exception ignored) { }
    }
    private void scheduleSlide() {
        handler.removeCallbacks(advance); JSONObject settings = manifest == null ? null : manifest.optJSONObject("settings");
        int seconds = settings == null ? 60 : settings.optInt("intervalSeconds", 60); handler.postDelayed(advance, Math.max(8, seconds) * 1000L);
    }
    private void toggleControls() { if (controls != null) { root.removeView(controls); controls = null; } else showControls(); }
    private TimeZone frameTimeZone() {
        JSONObject settings = manifest == null ? null : manifest.optJSONObject("settings");
        return TimeZone.getTimeZone(settings == null ? "America/Toronto" : settings.optString("timeZone", "America/Toronto"));
    }
    private void showControls() {
        if (controls != null) root.removeView(controls);
        controls = new LinearLayout(this); controls.setOrientation(LinearLayout.VERTICAL); controls.setGravity(Gravity.CENTER); controls.setPadding(dp(14), dp(10), dp(14), dp(10)); controls.setBackgroundColor(Color.argb(245,255,248,239));
        DateFormat timeFormat = DateFormat.getTimeInstance(DateFormat.SHORT); timeFormat.setTimeZone(frameTimeZone());
        String sync = preferences.getLong("lastSync", 0) == 0 ? "" : " · " + timeFormat.format(new Date(preferences.getLong("lastSync", 0)));
        controls.addView(label(householdName() + " · " + photos.length() + t(" souvenirs", " memories") + sync, 17, GREEN, true));
        LinearLayout buttons = buttonRow(button(t("Photos", "Photos"), this::toggleControls),
            button("Wi-Fi", this::openWifi), button(t("Actualiser", "Refresh"), this::synchronize),
            button(t("Téléphone", "Phone"), this::showQr),
            button(t("Mises à jour", "Updates"), () -> new UpdateDialog(this).show()), languageButton());
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2); rowParams.topMargin = dp(10);
        controls.addView(buttons, rowParams);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM); root.addView(controls, p);
    }
    private void openWifi() {
        // This frame's system settings omit Back/Home. Never open a screen without our way back.
        if (!Settings.canDrawOverlays(this)) {
            new AlertDialog.Builder(this).setTitle("Wi-Fi")
                .setMessage(t("Kev doit terminer la préparation du bouton de retour de ce cadre.", "Kev needs to finish setting up this frame’s return button."))
                .setPositiveButton("OK", null).show(); return;
        }
        try {
            startForegroundService(new Intent(this, WifiReturnService.class));
            startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));
        } catch (Exception e) {
            stopService(new Intent(this, WifiReturnService.class));
            Toast.makeText(this, t("Les réglages Wi-Fi ne sont pas disponibles.", "Wi-Fi settings are unavailable."), Toast.LENGTH_LONG).show();
        }
    }
    private void showQr() {
        try {
            String url = "https://mosa-506ef.web.app"; JSONObject credentials = store.credentials(); if (credentials != null) url = credentials.optString("appUrl", url);
            FrameSync.validateBase(url);
            BitMatrix matrix = new MultiFormatWriter().encode(url, BarcodeFormat.QR_CODE, 360, 360);
            Bitmap image = Bitmap.createBitmap(360, 360, Bitmap.Config.ARGB_8888);
            for (int y = 0; y < 360; y++) for (int x = 0; x < 360; x++) image.setPixel(x, y, matrix.get(x, y) ? GREEN : CREAM);
            LinearLayout content = new LinearLayout(this); content.setPadding(dp(20), dp(10), dp(20), dp(15)); content.setGravity(Gravity.CENTER); content.setOrientation(LinearLayout.VERTICAL);
            ImageView qr = new ImageView(this); qr.setImageBitmap(image); content.addView(qr, new LinearLayout.LayoutParams(dp(250), dp(250)));
            content.addView(label(t("Scannez pour ouvrir Mosa sur votre téléphone.", "Scan to open Mosa on your phone."), 19, GREEN, true));
            content.addView(label(t("Votre lien personnel fourni par Kev donne accès à votre album.", "Your personal link from Kev gives access to your album."), 16, MUTED, false));
            content.addView(label(t("iPhone : Partager → Sur l’écran d’accueil. Android : Installer l’application.", "iPhone: Share → Add to Home Screen. Android: Install app."), 14, MUTED, false));
            new AlertDialog.Builder(this).setTitle(t("Mosa dans votre poche", "Mosa in your pocket")).setView(content).setPositiveButton(t("Fermer", "Close"), (d, w) -> immersive()).show();
        } catch (Exception e) { Toast.makeText(this, t("Le QR sera disponible après la préparation.", "The QR will be available after setup."), Toast.LENGTH_LONG).show(); }
    }
    private void synchronize() {
        if (!alive || !syncing.begin()) return;
        status = "downloading";
        network.execute(() -> new FrameSync(store).sync(new FrameSync.Listener() {
            @Override public boolean needsRefresh() { return syncing.hasPending(); }
            @Override public void onUpdateRequest(JSONObject request) { handler.post(() -> { if (alive) remoteUpdate.accept(request); }); }
            @Override public void onComplete(JSONObject value, String message) { handler.post(() -> {
                if (!alive) return; status = message; loadManifest(value);
                if (!"downloading".equals(message)) {
                    boolean pending = syncing.finish();
                    realtime.ensureConnected();
                    handler.removeCallbacks(periodicSync); handler.postDelayed(periodicSync, pending ? 0 : 900000);
                }
            }); }
            @Override public void onError(String code) { handler.post(() -> {
                if (!alive) return; boolean pending = syncing.finish(); status = code; loadManifest(store.manifest());
                if ("access_revoked".equals(code)) realtime.stop();
                handler.removeCallbacks(periodicSync); handler.postDelayed(periodicSync, pending ? 0 : 60000);
            }); }
        }));
    }
    private void applyNight() {
        if (nightCover == null) return;
        boolean night = System.currentTimeMillis() > awakeUntil && FrameNight.active(manifest, System.currentTimeMillis());
        nightCover.setVisibility(night ? View.VISIBLE : View.GONE); if (night) nightCover.bringToFront();
        WindowManager.LayoutParams params = getWindow().getAttributes(); params.screenBrightness = night ? 0.01f : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE; getWindow().setAttributes(params);
    }
    private void immersive() { getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE); }
    @Override protected void onResume() { super.onResume(); stopService(new Intent(this, WifiReturnService.class)); immersive(); if (store != null && !splash) { scheduleSlide(); synchronize(); } }
    @Override protected void onPause() { super.onPause(); handler.removeCallbacks(advance); }
    @Override public void onUserInteraction() { super.onUserInteraction(); if (preferences != null) preferences.edit().putLong("lastInteraction", System.currentTimeMillis()).apply(); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); if (intent.getBooleanExtra("showUpdates", false)) new UpdateDialog(this).show(); }
    @Override public void onBackPressed() { if (controls != null) toggleControls(); else showControls(); }
    @Override protected void onDestroy() { alive = false; if (realtime != null) realtime.stop(); if (remoteUpdate != null) remoteUpdate.stop(); handler.removeCallbacksAndMessages(null); network.shutdownNow(); images.shutdownNow(); try { if (connectivity != null && networkCallback != null) connectivity.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) { } super.onDestroy(); }
}
