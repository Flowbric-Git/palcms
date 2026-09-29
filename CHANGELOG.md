# Changelog

## 1.0.0

Première version.

**Installation**
- Une commande sur Ubuntu 22.04 / 24.04 (`install.sh`) : IP ou domaine, racine ou sous-chemin (`/cms`), HTTPS avec Let's Encrypt, auto-signé ou sans
- Attend tout seul la fin des mises à jour automatiques d'Ubuntu sur un VPS tout neuf
- Assistant web protégé par un jeton à usage unique
- Au choix : installer un nouveau serveur Palworld, connecter un serveur existant, ou juste le site (serveur à connecter plus tard)
- `palcms-config` pour changer l'adresse, le chemin ou le HTTPS après coup
- Crossplay : le serveur apparaît dans la liste des serveurs communautaires (Xbox, Game Pass PC et PS5 ne peuvent pas se connecter par IP)

**Site public**
- Accueil, actus, pages, menu modifiable, thème clair / sombre
- Statut et joueurs connectés en temps réel
- Carte en direct : joueurs, points d'intérêt, bases des guildes, points de voyage rapide et tours de boss
- Classement (niveau, temps de jeu, ancienneté, constructions) et profils de joueurs avec graphiques
- Guildes : membres, niveau, bases
- Paldex façon boîte à Pals : les 288 Pals par numéro avec leur image, silhouettes pour ceux pas encore capturés, Paldex du serveur, de chaque joueur et de chaque guilde, classements des collectionneurs
- Calendrier des événements avec compte à rebours sur l'accueil
- Page de disponibilité (30 jours, fréquentation par heure, prochain redémarrage)
- Comptes joueurs via Steam (validés automatiquement) ou par email (validés par l'équipe), avec leurs Pals, leur inventaire et leur guilde
- Signalements et suggestions envoyés à l'équipe

**Panel admin**
- Serveur : tableau de bord, démarrage / arrêt / redémarrage, éditeur de `PalWorldSettings.ini`, joueurs, logs en direct, sauvegardes auto avec restauration, redémarrages programmés avec annonces, annonces en jeu, console RCON
- Surveillance : jauges (FPS, temps de frame, joueurs, bases, processeur, mémoire, disque), alertes avec seuils réglables, détection des plantages, historique sur 30 jours, sauvegarde du monde en un clic, arrêt propre avec compte à rebours
- Statistiques de fréquentation : heures de pointe, joueurs uniques, nouveaux joueurs, joueurs qui reviennent
- Données du monde (lecture des sauvegardes avec `sav_cli`) : inventaire, Pals et guilde de chaque joueur, recherche d'un objet chez tous les joueurs
- Événements et préréglages : week-end XP x3 et autres réglages temporaires remis à la fin, préréglages Détente / Normal / Difficile / x2 / x3, import / export de la configuration (sans les mots de passe)
- Modération : kick / ban / whitelist, avertissements, notes privées, bans temporaires levés automatiquement, historique par joueur, anti-triche léger (niveaux, quantités d'objets)
- Site : pages, actus, menu, apparence, thèmes, carte, Discord (notifications et alertes), modules, membres, signalements
- Mise à jour automatique du serveur Palworld et mise à jour de PalCMS en un clic
- Équipe avec rôles (Administrateur, Modérateur, Rédacteur + rôles perso) et journal des actions

**Démo**
- Démo en ligne sur [demo.palcms.online](https://demo.palcms.online/) : site public et panel admin avec des données fictives, sans serveur

**Sécurité**
- Le CMS ne tourne pas en root, les actions système passent par `palctl` (liste blanche de commandes)
- Protection CSRF, HTML nettoyé côté serveur, vérification des images, mots de passe hachés (scrypt)
