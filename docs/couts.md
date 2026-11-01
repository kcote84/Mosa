# Estimation des coûts

Estimation vérifiée le 31 octobre 2026 : **0 à 5 $ CA/mois avant taxes pour sept cadres**, pour un usage familial normal. C'est une estimation, pas un prix fixe ni un plafond de facturation.

## Hypothèse de référence

- Sept cadres connectés en permanence, vérification toutes les quinze minutes : 20 160 cycles en trente jours.
- Un cycle sans changement : deux requêtes API (manifest + heartbeat), environ quatre lectures et deux écritures Firestore. Donc environ 2 688 lectures et 1 344 écritures par jour, hors utilisation de la PWA et nouveaux albums.
- Mille nouvelles photos/mois, poids moyen supposé de 300 Ko après optimisation : 300 Mo de nouvelles images, plus les miniatures. Si chaque photo est envoyée aux sept cadres, environ 2,1 Go de premières copies, plus la consultation sur téléphone.
- Dix mille photos de 300 Ko occupent environ 3 Go, plus les miniatures. Le poids moyen réel dépend du contenu; 300 Ko n'est pas un maximum imposé par le code.

Les cadres conservent les images reçues. Afficher la même image pendant une semaine ne la télécharge pas à chaque rotation. En l'absence de changement, une version d'album permet au serveur d'éviter de relire toute la collection. Un ajout ou retrait demande un nouveau manifeste, puis seuls les nouveaux fichiers nécessaires sont téléchargés.

Depuis la version 0.4.0, chaque cadre écoute aussi un petit compteur privé Firestore. Une modification ajoute une écriture par foyer destinataire et des lectures de signal/permissions par cadre connecté, puis une synchronisation. Les reconnexions provoquent également des lectures. Aucun serveur Cloud Functions ne reste ouvert pour cette écoute et il n'y a pas de vérification en boucle toutes les quelques secondes. Les coûts réels restent à suivre dans la facturation; le temps réel ne constitue pas un plafond de dépenses.

## Tarification à suivre

Firestore inclut 50 000 lectures et 20 000 écritures par jour. Le stockage Standard bénéficie de 5 Go-mois gratuits dans les régions éligibles, dont `us-east1`. Les frais du serveur, de l'hébergement, des transferts et des opérations restent à prendre en compte. Les photos passent par une API privée : le quota de transfert Cloud Storage n'est pas à lui seul le quota de l'application entière.

Les quotas gratuits de certains services sont partagés au niveau du compte de facturation; d'autres projets peuvent en consommer une partie. Un import initial massif, des réinstallations multiples, la consultation intensive sur téléphone et de nombreux déploiements peuvent augmenter les frais. Les tarifs publiés en USD et la facturation canadienne/taxes ne sont pas identiques.

La limite de trois instances et le nettoyage des images de compilation après sept jours réduisent les frais possibles, sans constituer un plafond monétaire. Une alerte à 5 $ envoie une notification; elle ne suspend pas les services. Aucun budget global avec arrêt à 5 $ n'a été configuré par ce déploiement. Les plafonds par service proposés par Firebase ne couvrent pas nécessairement l'ensemble des services utilisés par Mosa.

Sources : [Firebase](https://firebase.google.com/pricing), [Cloud Storage](https://cloud.google.com/storage/pricing), [Cloud Run](https://cloud.google.com/run/pricing), [alertes et plafonds par service](https://firebase.google.com/docs/projects/billing/budget-alerts).
