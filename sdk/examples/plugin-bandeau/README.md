# Bandeau d'annonce (plugin d'exemple)

Affiche un bandeau en haut de toutes les pages du site : événement, maintenance, wipe, lien Discord… Le message, le lien, la couleur, la date de fin et la possibilité de le fermer se règlent dans *Panel admin > Extensions > Plugins > Bandeau d'annonce* (icône Réglages). Les clics sur le bouton sont comptés jour par jour dans *Extensions > Bandeau d'annonce*.

Ce plugin montre :
- des réglages modifiables dans le panel (`palcms.json` > `settings`, lus côté serveur avec `pal.config()`) ;
- une table en base (`pal.migrate`) et des routes API publiques et réservées à l'équipe (`pal.route`) ;
- un bloc sur toutes les pages (`pal.widget('layout.top', …)`) et une page dans le panel (`pal.adminPage`) ;
- des classes Tailwind propres au plugin (`src/style.css`).
