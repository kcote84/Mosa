package app.mosa.frame;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;
import android.widget.Button;
import android.widget.TextView;
import java.text.DateFormat;
import java.util.Date;
import java.util.TimeZone;

final class UpdateDialog {
    private final Activity activity;
    private final SharedPreferences prefs;
    private AlertDialog dialog;
    private TextView message;
    UpdateDialog(Activity activity) { this.activity = activity; prefs = FrameUpdater.prefs(activity); }
    private String t(String fr, String en) { return "en".equals(activity.getSharedPreferences("mosa", 0).getString("locale", "fr")) ? en : fr; }
    void show() {
        message = new TextView(activity); message.setTextSize(18); message.setPadding(32, 20, 32, 20);
        dialog = new AlertDialog.Builder(activity).setTitle(t("Mises à jour Mosa", "Mosa updates")).setView(message)
            .setPositiveButton(t("Rechercher maintenant", "Check now"), null).setNegativeButton(t("Fermer", "Close"), null).create();
        SharedPreferences.OnSharedPreferenceChangeListener changes = (p, key) -> activity.runOnUiThread(this::refresh);
        dialog.setOnShowListener(d -> { prefs.registerOnSharedPreferenceChangeListener(changes); refresh(); dialog.getButton(-1).setOnClickListener(v -> action()); });
        dialog.setOnDismissListener(d -> prefs.unregisterOnSharedPreferenceChangeListener(changes));
        dialog.show();
    }
    private void refresh() {
        if (dialog == null || !dialog.isShowing()) return;
        String state = prefs.getString("state", "idle"); String detail;
        switch (state) {
            case "checking": detail = t("Recherche en cours…", "Checking…"); break;
            case "downloading": detail = t("Téléchargement sécurisé en cours…", "Downloading securely…"); break;
            case "ready": detail = t("La version ", "Version ") + prefs.getString("latestVersion", "") + t(" est prête. Android demandera de confirmer l’installation.", " is ready. Android will ask you to confirm installation."); break;
            case "up_to_date": detail = t("Mosa est à jour.", "Mosa is up to date."); break;
            case "installing": detail = t("Préparation de l’installation…", "Preparing installation…"); break;
            case "error":
                String error = prefs.getString("error", "offline");
                detail = "invalid_update".equals(error) ? t("Ce fichier n’a pas pu être vérifié. Mosa ne l’installera pas.", "This file could not be verified. Mosa will not install it.")
                    : "storage_full".equals(error) ? t("Il manque d’espace pour la mise à jour. Contactez Kev.", "There is not enough room for the update. Contact Kev.")
                    : t("Vérifiez le Wi-Fi, puis réessayez. Vos photos restent disponibles.", "Check Wi-Fi and try again. Your photos are still available."); break;
            default: detail = t("Recherchez la dernière version de Mosa.", "Check for the latest version of Mosa.");
        }
        DateFormat format = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT); format.setTimeZone(TimeZone.getTimeZone(UpdateScheduler.zone(activity)));
        long last = prefs.getLong("lastSuccess", 0);
        message.setText(t("Version installée : ", "Installed version: ") + BuildConfig.VERSION_NAME + "\n\n" + detail + "\n\n"
            + t("Recherche et téléchargement chaque nuit à minuit. L’installation attend votre confirmation.", "Checks and downloads every night at midnight. Installation waits for your confirmation.")
            + (last > 0 ? "\n\n" + t("Dernière vérification : ", "Last checked: ") + format.format(new Date(last)) : ""));
        Button action = dialog.getButton(-1);
        action.setText("ready".equals(state) ? t("Installer la mise à jour", "Install update") : t("Télécharger la dernière version", "Download latest version"));
        action.setEnabled(!"checking".equals(state) && !"downloading".equals(state) && !"installing".equals(state));
    }
    private void action() {
        if (!"ready".equals(prefs.getString("state", ""))) { UpdateScheduler.start(activity); return; }
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            if (!Settings.canDrawOverlays(activity)) {
                new AlertDialog.Builder(activity).setTitle("Mosa").setMessage(t("Kev doit terminer la préparation du bouton de retour avant d’ouvrir les réglages Android.", "Kev needs to finish preparing the return button before opening Android settings.")).setPositiveButton("OK", null).show(); return;
            }
            new AlertDialog.Builder(activity).setTitle(t("Autoriser les mises à jour", "Allow updates"))
                .setMessage(t("Dans le prochain écran Android, autorisez Mosa à installer ses mises à jour, puis revenez aux photos. Mosa n’accepte que ses propres versions signées.", "On the next Android screen, allow Mosa to install its updates, then return to photos. Mosa only accepts its own signed versions."))
                .setPositiveButton(t("Ouvrir le réglage", "Open setting"), (d, which) -> {
                    activity.startForegroundService(new Intent(activity, WifiReturnService.class));
                    try { activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))); }
                    catch (Exception e) { activity.stopService(new Intent(activity, WifiReturnService.class)); FrameUpdater.state(activity, "error"); }
                }).setNegativeButton(t("Annuler", "Cancel"), null).show(); return;
        }
        FrameUpdater.state(activity, "installing");
        new Thread(() -> {
            try { new FrameUpdater(activity).install(); }
            catch (Exception e) { prefs.edit().putString("state", "error").putString("error", "invalid_update").apply(); }
        }, "Mosa install").start();
    }
}
