# Préparer un cadre Mosa

Modèle testé : Moonka ZN-DP1002, Android 8.1/API 27, écran 1 280 × 800. Aucun root ni remplacement du micrologiciel. L'application Frameo reste installée.

## Compiler

Configurer `JAVA_HOME` (JDK 21) et `ANDROID_HOME` (SDK Android, plateforme 35). Le wrapper Gradle 8.9 est inclus.

```powershell
node scripts/prepare-android-signing.mjs
.\android\gradlew.bat -p android :app:assembleRelease
```

APK : `android/app/build/outputs/apk/release/app-release.apk`.

Sauvegarder **ensemble** `.local/mosa-release.jks` et `.local/android-signing.json` dans un emplacement privé distinct du PC. Cette signature permet les futures mises à jour sans réinstaller les cadres. Ne jamais publier ces fichiers. Une version debug et une version release ont des signatures différentes : une migration debug → release exige une réinstallation et un nouvel enrôlement. Les mises à jour release → release utilisent `adb install -r` et conservent les données.

## Attribuer le cadre

1. Dans Administration, choisir le foyer, créer son cadre, puis télécharger sa préparation. Le fichier est à usage unique et expire après 24 h.
2. Activer ADB sur ce cadre et le connecter au PC. Identifier son numéro avec `adb devices`.
3. Installer la version signée, autoriser le bouton de retour Wi-Fi (permission d'affichage au-dessus des applications approuvée par le propriétaire), attribuer Mosa comme écran d'accueil, puis déposer la préparation.

```powershell
.\scripts\install-frame.ps1 -Serial NUMERO_DU_CADRE -Adb CHEMIN_VERS_ADB -Provisioning CHEMIN_VERS_PREPARATION -EnableWifiReturnButton
```

Le script exige un appareil précis. Il ne réinitialise pas le cadre et n'efface pas Frameo. Si Fully Kiosk était utilisé, le désactiver sur ce cadre pour éviter deux applications qui démarrent ensemble :

```powershell
adb -s NUMERO_DU_CADRE shell pm disable-user --user 0 de.ozerov.fully
```

L'application consomme puis supprime le fichier de préparation. Son accès durable est chiffré avec Android Keystore. Les photos restent dans le stockage privé persistant de Mosa, avec vérification SHA-256 de chaque téléchargement.

## Vérifier avant d'emballer

- Le nom du foyer, la langue et les destinataires sont corrects.
- Les dix photos approuvées sont téléchargées; le compteur de la PWA le confirme.
- Redémarrage : Mosa se lance seul.
- Sans Wi-Fi : les photos continuent. Attendre que le Wi-Fi soit réellement arrêté avant de tester un redémarrage.
- Sur les réglages Wi-Fi : bouton bleu « Revenir aux photos » ou « Back to photos », y compris lorsque le clavier est ouvert.
- Mode nuit : 23 h à 5 h dans `America/Toronto`; le cadre tient compte du changement d'heure. Toucher l'écran le réveille momentanément.
- Le QR ouvre la PWA. Le lien personnel d'invitation reste nécessaire pour connecter chaque personne; le QR public n'accorde pas accès à l'album.
- Le bouton « Mises à jour » fonctionne. Si souhaité, autoriser une fois Mosa à installer ses mises à jour dans les réglages Android; chaque installation demande encore une confirmation.

### Préparer les installations sans clic

Android 8.1 permet l'installation silencieuse à l'application désignée comme **gestionnaire de l'appareil** (`Device Owner`). Ce statut Android est distinct du rôle administrateur de l'album Mosa. Il donne des droits étendus et durables sur le cadre; son activation exige l'accord du propriétaire. Mosa n'utilise pas de politique d'effacement, de verrouillage, de collecte de comptes ou de contrôle du réseau. Son installateur accepte exclusivement son propre paquet signé, plus récent.

Avant l'activation, vérifier qu'il n'y a aucun autre gestionnaire, aucun compte Android et aucun utilisateur secondaire. Si Android refuse, arrêter et examiner la cause; ne pas réinitialiser l'appareil ni modifier les indicateurs système pour contourner le refus.

Une fois l'accord obtenu, installer une version 0.3.0 ou plus récente et exécuter :

```powershell
adb -s NUMERO_DU_CADRE shell dpm set-device-owner app.mosa.frame/.MosaDeviceAdmin
```

Pour un nouveau cadre, le script de préparation accepte le commutateur explicite `-EnableAutomaticUpdates` en plus de `-EnableWifiReturnButton`. Ce commutateur signifie que le propriétaire a accepté la gestion du cadre. Aucune réinitialisation n'est effectuée.

Le retour au mode manuel est prévu via une commande USB protégée par la permission Android `DUMP` (accessible au shell ADB, pas aux applications ordinaires) :

```powershell
adb -s NUMERO_DU_CADRE shell am broadcast -n app.mosa.frame/.MaintenanceReceiver -a app.mosa.frame.RELEASE_MANAGEMENT
adb -s NUMERO_DU_CADRE shell dumpsys device_policy
```

Cette commande retire le statut de gestionnaire sans appeler d'effacement. Vérifier son résultat sur chaque micrologiciel. Ne pas désinstaller Mosa pour retirer la gestion : la désinstallation effacerait les données de l'application.

## Mises à jour à distance

À partir de 0.2.0, chaque cadre recherche et télécharge les nouvelles versions à **00:00 dans le fuseau du cadre** (initialement `America/Toronto`). Une alarme Android est recalculée après redémarrage, remplacement de l'application ou changement d'heure. Les journées de 23/25 heures restent correctes. Sur un Android récent qui refuse les alarmes exactes, l'heure peut être décalée par le système; le modèle testé utilise Android 8.1.

Si Internet était absent à minuit, la prochaine synchronisation réessaie, avec au moins quinze minutes entre les échecs. Un nouveau jour permet une tentative à minuit même si la précédente était à 23:59. L'app vérifie aussi au démarrage si la recherche du jour a été manquée. La vérification ne réveille pas l'écran; le téléchargement ne lance jamais l'installateur pendant la nuit.

Sur les cadres gérés avec Mosa 0.3.0+, l'installation se lance automatiquement **entre 00:00 et 05:00**, après vérification du fichier. Elle attend au moins cinq minutes après la dernière interaction tactile. Une installation échouée n'est retentée automatiquement qu'une autre nuit pour la même version. Un système qui réclamerait quand même une confirmation ne provoque aucun écran nocturne : la session est abandonnée et la version attend. La fenêtre d'installation reste 00:00–05:00 même si l'horaire d'affichage de nuit a été personnalisé.

L'application se relance avec ses photos après le remplacement. Le fond de démarrage est noir; le mode nuit est appliqué dès la création de la fenêtre et le logo de démarrage est sauté lors d'une mise à jour. Aucun redémarrage complet du cadre n'est demandé. Le mode nuit reste un affichage noir à faible luminosité, pas une coupure électrique de la dalle.

Sur un cadre non géré : toucher une photo → **Mises à jour** → **Télécharger la dernière version** → **Installer la mise à jour**. Android doit autoriser Mosa comme source d'installation et confirmer chaque mise à jour.

L'administration mobile propose le téléchargement du fichier destiné aux cadres. Le bouton « Mettre à jour Mosa sur ce téléphone » se trouve en bas de l'accueil et est accessible à tous les membres, y compris ceux sans rôle administrateur. Télécharger le fichier du cadre sur le téléphone n'ordonne pas une installation sur un cadre distant.

Avant installation, le cadre vérifie la taille, SHA-256, l'identité `app.mosa.frame`, la compatibilité Android, une version strictement supérieure et la **même signature** que celle déjà installée. Il refuse les APK débogables. Aucun jeton d'album n'est envoyé au serveur de mises à jour. Seuls les fichiers signés sont publics; ils ne contiennent pas de photos ni d'identifiants familiaux.

### Publier une nouvelle version

1. Augmenter `versionCode` et `versionName` dans `android/app/build.gradle`; ne jamais réutiliser un numéro déjà publié avec un fichier différent.
2. Compiler et tester avec Java 21 et le SDK Android (build-tools 35.0.0) :

```powershell
.\android\gradlew.bat -p android :app:testDebugUnitTest :app:assembleRelease :app:lintRelease
npm run release:frame
npm run build
firebase deploy --only hosting --project mosa-506ef
```

La préparation vérifie la signature de production et crée `web/public/updates/frame.json` ainsi qu'un APK au nom immuable. Garder les anciennes versions dans ce dossier pour les téléchargements en cours. Ces fichiers générés sont exclus de Git. Sur un nouveau PC, les recréer avec la clé sauvegardée avant publication; le contrôle `predeploy` refuse un site compilé dépourvu d'APK cohérent. La distribution utilise Firebase Hosting, sans requête Firestore quotidienne pour les mises à jour.

En cas de défaut, corriger et publier un `versionCode` supérieur. Une rétrogradation Android n'est pas tentée automatiquement. Les cadres antérieurs à 0.2.0 nécessitent une première installation USB pour recevoir ce mécanisme.

### Diagnostic et essai USB

```powershell
adb -s NUMERO_DU_CADRE shell am broadcast -n app.mosa.frame/.MaintenanceReceiver -a app.mosa.frame.UPDATE_STATUS
adb -s NUMERO_DU_CADRE shell am broadcast -n app.mosa.frame/.MaintenanceReceiver -a app.mosa.frame.CHECK_UPDATES
```

Pour tester volontairement une installation silencieuse en dehors de la nuit, ajouter `--ez installNow true` à la seconde commande. Cette exception passe uniquement par le récepteur protégé pour maintenance; elle exige toujours que Mosa soit gestionnaire et conserve tous les contrôles du fichier. Aucun lien web ni membre de la famille ne peut l'invoquer. Ne publier et lancer une version d'essai qu'après avoir vérifié la sauvegarde de la signature, l'identité du cadre et le consentement à son mode géré.

Conserver le Wi-Fi de la maison d'installation uniquement pour les essais; ne pas publier son mot de passe. Les destinataires pourront choisir leur propre réseau.

## Retour à l'état précédent

Réactiver Fully Kiosk si nécessaire : `adb -s NUMERO_DU_CADRE shell pm enable de.ozerov.fully`, puis ouvrir l'application voulue ou la choisir comme application d'accueil. Frameo n'est pas supprimé. Pour couper l'accès Mosa d'un cadre perdu, utiliser Révoquer dans l'administration : le serveur refuse immédiatement ses demandes; les photos locales sont effacées lors du prochain contact réussi avec le serveur.

Un cadre hors ligne ne peut pas recevoir un ordre de suppression immédiatement. Une révocation ne récupère pas les copies déjà enregistrées ailleurs par une personne autorisée.
