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

Conserver le Wi-Fi de la maison d'installation uniquement pour les essais; ne pas publier son mot de passe. Les destinataires pourront choisir leur propre réseau.

## Retour à l'état précédent

Réactiver Fully Kiosk si nécessaire : `adb -s NUMERO_DU_CADRE shell pm enable de.ozerov.fully`, puis ouvrir l'application voulue ou la choisir comme application d'accueil. Frameo n'est pas supprimé. Pour couper l'accès Mosa d'un cadre perdu, utiliser Révoquer dans l'administration : le serveur refuse immédiatement ses demandes; les photos locales sont effacées lors du prochain contact réussi avec le serveur.

Un cadre hors ligne ne peut pas recevoir un ordre de suppression immédiatement. Une révocation ne récupère pas les copies déjà enregistrées ailleurs par une personne autorisée.
