# Third-party notices

## Palpagos map — `apps/web/public/map-palpagos.jpg`

- **Content**: official Palpagos map (`T_WorldMap` texture), scaled down from 8192 to 4096 px (JPEG, quality 80).
- **Rights**: **© Pocketpair, Inc.** This file is **not** covered by the PalCMS MIT license.
- **Source**: [LukeHollandDev/palworld-live-map](https://github.com/LukeHollandDev/palworld-live-map), file `assets/palworld/maps/palpagos.jpg`. SHA-256 of the original: `9961632d5c38a0a67fd18713fa63af0ac6f192e71fadeb5ba53ae696b8914dd1`.
- **Calibration** (world coordinates `[maxX, maxY, minX, minY]`): `[349400, 724400, -1099400, -724400]`.

If Pocketpair asks for this file to be removed, simply delete it. The CMS then shows a neutral map, and each admin can upload their own image from the panel (*Website > Map*).

## Coordinate conversions — `packages/shared/src/mapCoords.ts`

- The conversion of coordinates to the image follows the calibration convention of [palworld-live-map](https://github.com/LukeHollandDev/palworld-live-map) (MIT license, © 2026 Luke Holland).
- The conversion to the coordinates shown in game follows the formula of [palworld-coord](https://github.com/palworldlol/palworld-coord) (MIT license).

## Reading saves — `sav_cli`

- World data (inventories, Pals, guilds, bases) is read with `sav_cli`, taken from [palworld-server-tool](https://github.com/zaigie/palworld-server-tool) (Apache-2.0 license). Its runtime dependencies (palsav-flex, palooz) are under the GPL-3.0-or-later license.
- `sav_cli` **is not included** in PalCMS: it is downloaded on the VPS from the official `v0.12.2` release of palworld-server-tool, and its SHA-256 checksum is checked before install (`scripts/palctl`, `savtools-install` command).

## Pal, item and passive names — `apps/server/src/gamedata`

- Name tables (in English) and coordinates of fast travel points and boss towers, taken from [palworld-server-tool](https://github.com/zaigie/palworld-server-tool) (`web/src/assets`, Apache-2.0 license).
- The names themselves belong to Pocketpair, Inc.

## Paldex list — `packages/shared/src/paldex.json`

- Numbers, names and elements of the 288 Pals of Palworld 1.0, extracted from the game files by [AlbertoJALJ/Palworld](https://github.com/AlbertoJALJ/Palworld) (`data/pals.json`). Only these facts are used.
- The names belong to Pocketpair, Inc.

## Pal images — `apps/web/public/pals`

- Pal icons shown in the Paldex, taken from [palworld-server-tool](https://github.com/zaigie/palworld-server-tool) (`web/src/assets/pals`).
- **Rights**: **© Pocketpair, Inc.** These images are **not** covered by the PalCMS MIT license. If their removal is requested, simply delete the folder: the Paldex then shows a neutral placeholder instead.

## Trademarks

Palworld is a trademark of Pocketpair, Inc. PalCMS is an independent project, not affiliated with Pocketpair: it is neither affiliated with, endorsed nor sponsored by that company.

## Dependencies

The libraries used (Fastify, React, Leaflet, TipTap, Tailwind CSS, better-sqlite3…) are distributed under their own open-source licenses. These licenses are included in their respective packages, in `node_modules`.
