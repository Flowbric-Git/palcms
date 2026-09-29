# Mentions tierces

## Carte de Palpagos — `apps/web/public/map-palpagos.jpg`

- **Contenu** : carte officielle de Palpagos (texture `T_WorldMap`), réduite de 8192 à 4096 px (JPEG, qualité 80).
- **Droits** : **© Pocketpair, Inc.** Ce fichier n'est **pas** couvert par la licence MIT de PalCMS.
- **Source** : [LukeHollandDev/palworld-live-map](https://github.com/LukeHollandDev/palworld-live-map), fichier `assets/palworld/maps/palpagos.jpg`. SHA-256 de l'original : `9961632d5c38a0a67fd18713fa63af0ac6f192e71fadeb5ba53ae696b8914dd1`.
- **Calibration** (coordonnées monde `[maxX, maxY, minX, minY]`) : `[349400, 724400, -1099400, -724400]`.

Si Pocketpair demande le retrait de ce fichier, il suffit de le supprimer. Le CMS affiche alors une carte neutre, et chaque admin peut importer sa propre image depuis le panel (*Gestion du site > Carte*).

## Conversions de coordonnées — `packages/shared/src/mapCoords.ts`

- La conversion des coordonnées vers l'image reprend la convention de calibration de [palworld-live-map](https://github.com/LukeHollandDev/palworld-live-map) (licence MIT, © 2026 Luke Holland).
- La conversion vers les coordonnées affichées en jeu reprend la formule de [palworld-coord](https://github.com/palworldlol/palworld-coord) (licence MIT).

## Lecture des sauvegardes — `sav_cli`

- Les données du monde (inventaires, Pals, guildes, bases) sont lues avec `sav_cli`, tiré de [palworld-server-tool](https://github.com/zaigie/palworld-server-tool) (licence Apache-2.0). Ses dépendances d'exécution (palsav-flex, palooz) sont sous licence GPL-3.0 ou ultérieure.
- `sav_cli` **n'est pas inclus** dans PalCMS : il est téléchargé sur le VPS depuis la version officielle `v0.12.2` de palworld-server-tool, et son empreinte SHA-256 est vérifiée avant l'installation (`scripts/palctl`, commande `savtools-install`).

## Noms des Pals, objets et talents — `apps/server/src/gamedata`

- Tables de noms (en anglais) et coordonnées des points de voyage rapide et des tours de boss, extraites de [palworld-server-tool](https://github.com/zaigie/palworld-server-tool) (`web/src/assets`, licence Apache-2.0).
- Les noms eux-mêmes appartiennent à Pocketpair, Inc.

## Liste du Paldex — `packages/shared/src/paldex.json`

- Numéros, noms et éléments des 288 Pals de Palworld 1.0, extraits des fichiers du jeu par [AlbertoJALJ/Palworld](https://github.com/AlbertoJALJ/Palworld) (`data/pals.json`). Seuls ces faits sont repris.
- Les noms appartiennent à Pocketpair, Inc.

## Images des Pals — `apps/web/public/pals`

- Icônes des Pals affichées dans le Paldex, reprises de [palworld-server-tool](https://github.com/zaigie/palworld-server-tool) (`web/src/assets/pals`).
- **Droits** : **© Pocketpair, Inc.** Ces images ne sont **pas** couvertes par la licence MIT de PalCMS. Si leur retrait est demandé, il suffit de supprimer le dossier : le Paldex affiche alors un emplacement neutre à la place.

## Marques

Palworld est une marque de Pocketpair, Inc. PalCMS est un projet indépendant, sans lien avec Pocketpair : il n'est ni affilié, ni approuvé, ni sponsorisé par cette société.

## Dépendances

Les bibliothèques utilisées (Fastify, React, Leaflet, TipTap, Tailwind CSS, better-sqlite3…) sont distribuées sous leurs propres licences open source. Ces licences sont incluses dans leurs paquets respectifs, dans `node_modules`.
