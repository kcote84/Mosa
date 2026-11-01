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
- Mises à jour : sept tests Android réussis couvrant minuit à Toronto, les changements d'heure, le rattrapage, les chemins et limites de téléchargement, la fenêtre d'installation, les interactions récentes, l'exigence du mode géré, la limitation des tentatives et le mode nuit. Compilation signée 0.3.4 et lint sans erreur.
- Autorisation explicite de Keven le 31 octobre : activer le mode géré sur son cadre et sur les prochains cadres familiaux. Activation Android réussie sans réinitialisation. Retrait via `RELEASE_MANAGEMENT`, conservation des trois photos et réactivation vérifiés sur le Moonka de test.
- Deux remplacements sans clic sur le cadre réel : 0.3.0 → 0.3.2, puis 0.3.3 → 0.3.4 après correction d'une double fermeture du flux de l'installateur. Le dernier remplacement signale `lastInstallStatus: 0`, `state: up_to_date`, `managed: true`, version 0.3.4 et trois photos. Android confirme que l'installateur est Mosa lui-même; aucun `adb install` n'est intervenu dans ces deux transitions. La version intermédiaire 0.3.3 a été installée par USB pour tester son installateur corrigé.
- Relance autonome et reprise de synchronisation confirmées par le diagnostic local et le serveur après remplacement. Les accès et le cache sont conservés.
- Essai vidéo en mode nuit : un ancien écran Frameo réapparaissait brièvement lors du premier remplacement. Frameo a été désactivé sans effacement, puis l'essai final ne montre que du noir sur les neuf images encodées (`YMAX = 16`, noir vidéo). La préparation des futurs cadres désactive aussi cet ancien lanceur s'il est présent. Preuves locales : `qa/auto-final.mp4` et `qa/automatic-updates-complete.png`.
- Les réglages de nuit temporaires de l'essai ont été restaurés à 23 h–5 h. Photos de nouveau affichées. Alarme exacte du prochain contrôle enregistrée pour le 1er novembre à 04:00 UTC, soit minuit à Toronto. Le test immédiat a utilisé la commande USB protégée; le déclenchement à l'heure réelle reste à observer durant une nuit d'utilisation.

## Retraits immédiats et mises à jour Wi-Fi — 1er novembre 2026

- Version signée 0.4.2 (code 15) publiée sur Firebase avec le serveur, les règles et la PWA. Le récepteur Wi-Fi est disponible dès 0.4.1.
- 5 tests de politique, 12 tests Android et 14 tests d'intégration réussis; compilation Android/PWA et lint Android sans erreur (avertissements existants de compatibilité des outils conservés).
- Les tests d'intégration écoutent réellement les signaux Firestore : masquage limité au foyer, retrait global, accès refusés aux autres foyers/photos/comptes et coupure après révocation/réenrôlement. Les commandes de mise à jour sont réservées à l'admin, persistantes, liées à la version publiée et protégées contre les accusés d'une demande précédente.
- Vérification de la session Firebase : lecture du signal autorisée pour son foyer; autre foyer et accès direct aux photos refusés. Les ressources de contrôle temporaires sont nettoyées après l'essai.
- Interface locale testée en français et en anglais : sélection du cadre, confirmation et statut « En attente du cadre ». Le bouton ne présente pas une demande envoyée comme une installation terminée.
- Les preuves de validation sur appareil, les mesures et les métadonnées des foyers restent dans les fichiers locaux exclus de Git.
- Le correctif 0.4.2 traite la commande urgente dès le manifeste authentifié, avant les téléchargements de photos, et récupère une ancienne session d'installation bloquée avant d'attendre l'installateur.

## Fondu du diaporama — 1er novembre 2026

- Version 0.4.3 (code 16) : fondu d'une seconde, deux couches d'image au maximum, première photo affichée directement. Les bandes noires font partie du fondu afin de respecter les cadrages différents.
- Le diaporama garde la photo courante pendant une synchronisation quand elle est encore autorisée. Un retrait invalide immédiatement les décodages en cours et retire la photo des deux couches, même pendant une transition.
- Durée par défaut portée à 60 secondes côté serveur et Android; les réglages personnalisés existants restent conservés. Le cadre de validation reçoit explicitement le nouveau réglage.
- 12 tests Android et 8 tests JavaScript réussis; compilations Android/PWA et lint Android terminés (0 erreur, 8 avertissements). Les preuves de contrôle sur appareil restent locales, hors du dépôt public.

## À vérifier avant les cadeaux

Gestion administrative des photos par cadre : 8 tests unitaires et 16 tests d'intégration réussis. Vérifiés : filtre par foyer, cadres en attente, accès admin seulement, rejet d'un cadre inconnu ou d'une photo non attribuée, retrait ciblé atomique, signal limité au foyer, maintien des images chez les autres destinataires et suppression globale. Le navigateur de test en largeur 390 px confirme le bouton d'accès, le choix du cadre, la confirmation du retrait, la disparition de la photo dans le seul foyer choisi et les libellés français/anglais. Seules des photos fictives ont été modifiées.

Invitations iPhone et cache : 8 tests unitaires et 15 tests d'intégration réussis. Les nouveaux liens `/connexion/` et les anciens liens racine sont acceptés; les invitations utilisées, remplacées et réellement expirées sont distinguées par l'API. Les sessions déjà ouvertes ne sont pas révoquées. Le parcours d'installation sur un iPhone physique doit être revérifié avec un nouveau membre; la récupération par collage dans l'app a été confirmée par l'utilisateur.

Menu du cadre 0.4.4 (code 17) : compilation signée et lint Android validés; disposition horizontale partagée pour le menu photo et l'accueil sans photos. La vérification visuelle sur appareil reste à confirmer.

Correctif de connexion PWA iPhone : formulaire bilingue de collage du lien dans l'app installée, validation de l'origine et du jeton, guide Safari/iPad avant consommation du lien. Les 8 tests unitaires passent. Dans le navigateur relié aux émulateurs, une adresse étrangère est refusée, une invitation fictive ouvre le bon compte membre sans module admin et la session reste active après rechargement. Le formulaire français et anglais est vérifié en largeur 390 px. La confirmation finale du maintien de session sur un iPhone physique reste une vérification utilisateur.

Correctif du bouton d'installation : l'offre est retirée dès son utilisation ou l'événement `appinstalled`, et ignorée lorsque Mosa est ouvert en application autonome (y compris `navigator.standalone` sur iOS). Les changements de mode d'affichage sont suivis. Aucun indicateur permanent n'est enregistré : une réinstallation reste possible si le navigateur la propose après une désinstallation. Compilation validée; confirmation sur le téléphone après fermeture et réouverture de Mosa encore nécessaire.

- Installation et maintien de connexion sur un véritable iPhone/Safari et un téléphone Android. Sur iPhone, vérifier que l'ouverture du lien personnel se fait dans la même application installée; la session d'un onglet et celle de la PWA peuvent être distinctes.
- Si un cadre doit rester non géré : vérifier séparément le parcours de confirmation Android, l'annulation et la nouvelle tentative. Ce parcours n'est pas utilisé sur les cadres familiaux préparés en mode automatique.
- Photos HEIC réelles, orientation, recadrage et rendu de portraits sur l'écran physique. Le convertisseur HEIC n'est chargé qu'au besoin et produit un fichier compilé assez volumineux.
- Nuit réelle 23 h–5 h et réveil tactile; luminosité confortable dans une chambre sombre.
- Plusieurs jours d'utilisation, coupure d'alimentation physique et récupération après une panne réseau prolongée.
- Chaque nouveau cadre : identité du foyer, mode géré autorisé, essai d'installation sans clic, retour Wi-Fi, démarrage, mémoire disponible, qualité d'image et dix photos personnelles approuvées.
- Observer la première facture; décider de la sauvegarde indépendante des albums et vérifier les alertes de budget souhaitées.

Les captures de contrôle et images de démonstration sont locales dans `qa/`, exclues de Git. Aucun portrait personnel n'a été importé pour ces essais.

## Dépendances à suivre

L'audit final des dépendances de production ne signale plus de vulnérabilité haute ou critique. Six alertes modérées transitives restent dans la chaîne `glob/minimatch/rimraf` des SDK Google. Mosa ne transmet pas de motifs ni de chemins de fichiers fournis par les utilisateurs à ces outils. Les suivre aux prochaines mises à jour des SDK, sans imposer une version majeure incompatible pour faire disparaître un avertissement.

Deux alertes hautes concernent les outils de développement Vite/Rollup verrouillés; le serveur Vite écoute uniquement `127.0.0.1` et n'est pas déployé. Le site publié contient les fichiers statiques compilés. Actualiser ces outils avant d'exposer un environnement de développement sur le réseau. L'audit npm n'est pas un audit de sécurité complet de l'application.
