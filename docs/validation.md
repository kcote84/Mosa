# État de validation — 31 octobre 2026

## Vérifié

- Compilation PWA et Android signée; contrôles Android lint de la version release.
- Installation npm reproductible et parcours API retestés après mise à jour de Firebase Admin 14.5.0, Functions 7.4.0, client Firebase 13.1.0 et Sharp 0.35.5. gRPC 1.14.7 est imposé pour éviter la vieille version transitive du SDK client.
- Cinq tests de politique d'accès et dix scénarios d'intégration (plus le scénario parent) réussis dans les émulateurs.
- Refus des accès anonymes et des accès directs Firestore; séparation des familles et destinataires exclus.
- Optimisation 1 920 px, JPEG, retrait EXIF; masquage par foyer et suppression globale.
- Invitations concurrentes, usage unique, révocation immédiate des sessions et anciens liens.
- Préparation concurrente de cadres : un seul lien valide, ancien accès refusé après rotation.
- Photo envoyée avant la création d'un cadre reçue lors de son premier enrôlement.
- En ligne : connexion administrateur réelle et envoi de trois illustrations au seul foyer du cadre de test; première synchronisation depuis Firebase confirmée par le compteur trois et l'affichage réel.
- Cadre Moonka : APK signé non débogable, Mosa choisi comme accueil, lancement autonome après redémarrage.
- Second redémarrage avec Wi-Fi confirmé désactivé avant ET après : photos toujours visibles; Wi-Fi réactivé après essai.
- Gros bouton ENGLISH, passage en anglais et bouton FRANÇAIS.
- Retour depuis les réglages Wi-Fi testé en français et en anglais; la surcouche disparaît au retour à Mosa.

## À vérifier avant les cadeaux

Correctif du bouton d'installation : l'offre est retirée dès son utilisation ou l'événement `appinstalled`, et ignorée lorsque Mosa est ouvert en application autonome (y compris `navigator.standalone` sur iOS). Les changements de mode d'affichage sont suivis. Aucun indicateur permanent n'est enregistré : une réinstallation reste possible si le navigateur la propose après une désinstallation. Compilation validée; confirmation sur le téléphone après fermeture et réouverture de Mosa encore nécessaire.

- Installation et maintien de connexion sur un véritable iPhone/Safari et un téléphone Android. Sur iPhone, vérifier que l'ouverture du lien personnel se fait dans la même application installée; la session d'un onglet et celle de la PWA peuvent être distinctes.
- Photos HEIC réelles, orientation, recadrage et rendu de portraits sur l'écran physique. Le convertisseur HEIC n'est chargé qu'au besoin et produit un fichier compilé assez volumineux.
- Nuit réelle 23 h–5 h et réveil tactile; luminosité confortable dans une chambre sombre.
- Plusieurs jours d'utilisation, coupure d'alimentation physique et récupération après une panne réseau prolongée.
- Chaque nouveau cadre : identité du foyer, retour Wi-Fi, démarrage, mémoire disponible, qualité d'image et dix photos personnelles approuvées.
- Observer la première facture; décider de la sauvegarde indépendante des albums et vérifier les alertes de budget souhaitées.

Les captures de contrôle et images de démonstration sont locales dans `qa/`, exclues de Git. Aucun portrait personnel n'a été importé pour ces essais.

## Dépendances à suivre

L'audit final des dépendances de production ne signale plus de vulnérabilité haute ou critique. Six alertes modérées transitives restent dans la chaîne `glob/minimatch/rimraf` des SDK Google. Mosa ne transmet pas de motifs ni de chemins de fichiers fournis par les utilisateurs à ces outils. Les suivre aux prochaines mises à jour des SDK, sans imposer une version majeure incompatible pour faire disparaître un avertissement.

Deux alertes hautes concernent les outils de développement Vite/Rollup verrouillés; le serveur Vite écoute uniquement `127.0.0.1` et n'est pas déployé. Le site publié contient les fichiers statiques compilés. Actualiser ces outils avant d'exposer un environnement de développement sur le réseau. L'audit npm n'est pas un audit de sécurité complet de l'application.
