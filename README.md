# Mosa

**Nos moments, chez vous. · Our moments, in your home.**

Album familial privé : une PWA pour envoyer, recadrer et répartir les photos, une application Android pour les cadres, et un serveur Firebase. Les photos sont conservées en ligne et sur chaque cadre destinataire; le PC n'a pas besoin de rester allumé.

Application : https://mosa-506ef.web.app — l'accès à un album exige un lien personnel. Le code source public ne donne pas accès aux photos.

## Fonctionnement

- Deux branches familiales séparées, avec un foyer pouvant appartenir aux deux. Aucun destinataire n'est coché par défaut. Le bouton « Tout le monde » sélectionne les foyers autorisés, avec possibilité de décocher individuellement ou de tout décocher.
- Un compte par personne, un album par foyer. Un foyer exclu ne reçoit pas la photo sur son cadre ni dans son album mobile. L'auteur conserve accès à ses propres envois; l'administrateur dispose d'un espace distinct de modération.
- Invitations personnelles à usage unique (48 h), sans mot de passe. Révocation des sessions et anciens liens depuis l'administration.
- Images optimisées en JPEG (maximum 1 920 px), miniatures de 480 px, métadonnées EXIF/GPS supprimées; les originaux ne sont pas conservés.
- Jusqu'à 50 photos par envoi. Les photos sont préparées et transmises une à une; les destinataires restent à choisir pour chaque nouvel envoi.
- Administration : « Photos du foyer » permet de retirer une photo chez un foyer précis, même avant l'association ou la première connexion de son cadre. Les autres foyers la conservent; le futur cadre ne téléchargera pas une photo retirée.
- Les cases de sélection permettent aussi le retrait groupé (jusqu'à 200 photos), avec confirmation du nombre et du foyer. « Tout cocher » porte sur les photos affichées; le retrait du lot est atomique et les nouvelles tentatives ne répètent pas le signal de synchronisation.
- Cadres préattribués : première connexion Wi-Fi, puis téléchargement des photos en attente. Dès la version 0.4.0, un signal privé déclenche la synchronisation à chaque ajout, masquage ou retrait; vérification toutes les 15 minutes en secours. Les images déjà présentes ne sont pas retéléchargées.
- Photos persistantes hors ligne, démarrage automatique, bouton **ENGLISH** bleu et retour visible depuis les réglages Wi-Fi.
- Recherche des mises à jour signées à minuit; installation automatique pendant la nuit sur les cadres préparés en mode géré, confirmation manuelle sur les autres. Boutons de mise à jour sur le cadre et dans la PWA.
- Depuis la version 0.4.1, l'administrateur peut aussi déclencher une mise à jour urgente par Wi-Fi, pour un cadre ou tous les cadres compatibles. Une demande hors ligne attend jusqu'à 7 jours; son résultat est suivi dans l'administration.
- Mode nuit initial **23:00–05:00, America/Toronto**. L'écran est assombri; il n'est pas électriquement éteint.

## Développer localement

Prérequis : Node 22+, npm, Java 21 pour les émulateurs et la compilation Android, Firebase CLI. Les dépendances sont verrouillées par les fichiers `package-lock.json`.

```powershell
npm ci
firebase emulators:start --project demo-mosa
```

Dans un second terminal :

```powershell
npm run seed:local
npm run dev
```

Le serveur de développement est à http://127.0.0.1:5173. Le lien d'administration fictif est dans `.local/local-admin-invitation.json`; remplacer son port 5000 par 5173 pour le développement avec Vite. La graine locale utilise uniquement des foyers fictifs. Les émulateurs doivent tourner sur les ports de `firebase.json`.

```powershell
npm test
npm run test:integration
npm run build
```

Les tests d'intégration requièrent la graine fictive dans `demo-mosa`. Ils modifient uniquement les données de test : envois, masquage, invitations, révocation et préparation de cadres. Ils refusent les accès anonymes et entre branches, et couvrent le cas d'un cadre créé après l'envoi d'une photo.

## Organisation

| Dossier | Rôle |
| --- | --- |
| `web` | PWA React, interface bilingue, recadrage, partage et administration |
| `functions` | API Express/Firebase : permissions, invitations, médias et synchronisation |
| `android` | Application native Java pour cadres Android 8.1+ |
| `scripts` | Préparation des comptes, des cadres et des ressources |
| `tests` | Règles de confidentialité et parcours réels contre les émulateurs |
| `.local` | Configuration familiale, liens temporaires et signature Android; jamais dans Git |

## Exploitation

- [Installer et préparer un cadre](docs/cadres.md)
- [Serveur, déploiement et récupération](docs/exploitation.md)
- [Coûts et hypothèses](docs/couts.md)
- [Vérifications et étapes restantes](docs/validation.md)

Les dix photos personnelles de bienvenue seront choisies avec le propriétaire ultérieurement. Les illustrations de test ne les remplacent pas. La PWA doit encore être validée sur de vrais iPhone et téléphones Android avant la distribution familiale.
