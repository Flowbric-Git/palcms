# Changelog

🇬🇧 [English version](CHANGELOG.md)

## 1.2.0

**Thèmes**
- Un thème peut verrouiller certains liens du menu du site (`menu.fixed` dans `palcms.json`) : ils restent en premier, dans l'ordre du thème, et ne peuvent être ni déplacés ni supprimés dans *Site > Menu*. Les autres liens restent modifiables (voir sdk/README.fr.md)

**Site**
- Supprimer une page retire aussi son lien du menu, et l'adresse du bouton « Rejoindre » de l'accueil si elle y menait ; changer l'adresse d'une page les met à jour
- Un clic sur un lien ouvre maintenant la nouvelle page en haut (ou à son #ancre) ; passer à la page suivante d'une liste (?page=2) remonte aussi en haut. Précédent/suivant gardent leur propre défilement

**Panel admin**
- Le menu latéral est plus court : Serveur et Site ont des groupes déroulants (Gestion, Joueurs, Design, Communauté), ouverts d'eux-mêmes quand la page courante est dedans et mémorisés
- Le panel est toujours en sombre, quel que soit le choix du visiteur sur le site public (le bouton clair/sombre est retiré du panel ; le site garde le choix du visiteur)
- Le logo du site remplace la patte en emoji dans le menu latéral
- Les champs à largeur fixe du panel (libellés de la page *Menu*, filtres, recherche du journal) ne prennent plus toute la ligne

## 1.1.1

**Données du monde**
- Lecture en direct de la sauvegarde toutes les 30 s pendant que des joueurs sont connectés : les Pals capturés apparaissent dans le Paldex et dans le profil en moins d’une minute (réglage dans *Serveur > Données du monde*, activé par défaut)
- Aucune sauvegarde forcée pour la lecture en direct (le serveur sauvegarde tout seul), espacement plus long sur les gros mondes
- Le profil, le Paldex et la page des guildes se rafraîchissent toutes les 30 s tant qu’ils sont ouverts

**Corrections**
- Les personnages sans nom de la sauvegarde s’affichaient « Inconnu » au lieu de « Unknown »

## 1.1.0

**Anglais et français**
- PalCMS est désormais en anglais par défaut, avec une traduction française complète : assistant d’installation, site public, panel admin, messages d’erreur, notifications Discord et annonces en jeu
- La langue du site se choisit dans l’assistant d’installation et se change dans *Site > Apparence* ; chaque visiteur peut basculer avec le bouton EN / FR (gardé dans son navigateur)
- Les dates et les nombres suivent la langue choisie
- Les sites existants restent en français : rien ne change tant que la langue n’est pas modifiée

**Adresses en anglais**
- Pages publiques : `/news`, `/leaderboard`, `/map`, `/players/…`, `/guilds`, `/events`, `/uptime`, `/report`, `/login`, `/register`, `/profile`
- Panel admin : `/admin/server/…` et `/admin/site/…`
- Les anciennes adresses en français fonctionnent toujours et redirigent ; le menu enregistré est converti automatiquement au premier démarrage
- Nouveau réglage pour le lien du bouton « Rejoindre le serveur » (*Site > Apparence*)

**Extensions**
- `lang()` et `t()` dans `@palcms/sdk` : les extensions peuvent suivre la langue du visiteur et réutiliser les traductions de PalCMS
- Plugin (Bandeau d’annonce) et thème (Aurora) d’exemple en anglais avec leurs textes en français, avec les nouvelles adresses

**Démo**
- La démo en ligne est en anglais, avec un bouton FR

**Corrections**
- Les changements d’un événement (« Taux d’expérience : x3 ») s’affichent dans la langue du visiteur
- Quelques messages d’erreur du serveur n’étaient pas traduits

**Code**
- Commentaires, noms des tests, scripts (`install.sh`, `palctl`, `palcms-config`) et documentation en anglais ; versions françaises dans les fichiers `.fr.md`

## 1.0.1

**Plugins et thèmes**
- Market dans le panel (*Extensions > Market*) : plugins et thèmes de palcms.online, filtres, recherche, installation et mise à jour en un clic
- Chaque ressource du market est signée : PalCMS vérifie la signature et l’empreinte avant d’installer
- Page *Plugins* : activer, désactiver, régler, supprimer, installer un fichier .zip. Les plugins se chargent sans redémarrer le CMS, et une erreur dans un plugin ne casse pas le site
- Page *Thèmes* : thèmes installés, activation et personnalisation (couleurs, images, textes), en plus des réglages avancés existants
- Un plugin peut ajouter des routes API, des tables, des pages publiques, des pages dans le panel et des blocs sur le site ; un thème peut remplacer l’en-tête, le pied de page et l’accueil
- Les fichiers non signés sont refusés, sauf si l’admin autorise les extensions non vérifiées
- Nouvelle permission « Plugins, thèmes et market »
- Kit de création (`sdk/`) : construction du paquet avec Tailwind, un plugin d’exemple (Bandeau d’annonce) et un thème d’exemple (Aurora), documentation
- Format de l’API du market et outils de signature pour palcms.online (`docs/market-api.md`)

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
