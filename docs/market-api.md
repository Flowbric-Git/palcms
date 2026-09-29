# API du market

Ce document décrit ce que le site du market (palcms.online) doit fournir pour que chaque PalCMS affiche le catalogue et installe les ressources en un clic.

## Adresse

PalCMS interroge par défaut `https://palcms.online/api/market`. Pour tester avec un autre market, ajoute `PALCMS_MARKET_URL=https://…/api/market` dans `/etc/palcms/config.env`, puis redémarre le CMS avec `sudo systemctl restart palcms`.

## Catalogue

`GET /api/market/resources` renvoie toutes les ressources publiées (JSON, code 200) :

```json
{
  "resources": [
    {
      "id": "bandeau",
      "type": "plugin",
      "name": "Bandeau d'annonce",
      "summary": "Un bandeau en haut du site pour annoncer un événement ou une maintenance.",
      "author": "PalCMS",
      "version": "1.0.0",
      "palcms": ">=1.0.1",
      "iconUrl": "https://palcms.online/market/bandeau/icon.png",
      "screenshots": ["https://palcms.online/market/bandeau/1.png"],
      "downloads": 128,
      "price": 0,
      "url": "https://palcms.online/market/bandeau",
      "download": "https://palcms.online/market/files/bandeau-1.0.0.zip",
      "sha256": "9f2c…",
      "signature": "k3Jd…==",
      "updatedAt": "2026-10-01T12:00:00Z"
    }
  ]
}
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `id` | oui | identique au `id` de `palcms.json` dans le paquet |
| `type` | oui | `plugin` ou `theme`, identique au paquet |
| `name`, `version` | oui | `version` au format `1.2.3` (dernière version publiée) |
| `summary`, `author` | non | affichés sur la carte de la ressource |
| `palcms` | non | versions de PalCMS compatibles (`>=1.0.1`) : le bouton Installer est masqué ailleurs |
| `iconUrl`, `screenshots` | non | URL absolues (la première capture sert d'image de la carte) |
| `downloads`, `price`, `url`, `updatedAt` | non | informations affichées ; `url` ouvre la page de la ressource |
| `download` | oui | URL absolue du `.zip` (20 Mo maximum) |
| `sha256` | oui | empreinte SHA-256 du `.zip`, en hexadécimal |
| `signature` | oui | signature Ed25519 du `.zip`, en base64 |

Une entrée mal formée est ignorée sans bloquer les autres. PalCMS garde le catalogue en cache 10 minutes : le bouton *Actualiser* du panel force une nouvelle lecture.

## Installation

Quand l'admin clique sur *Installer* (ou *Mettre à jour*), PalCMS :

1. relit le catalogue et vérifie que la ressource est compatible avec sa version ;
2. télécharge `download` ;
3. compare l'empreinte SHA-256 à `sha256` ;
4. vérifie `signature` avec la clé publique du market, intégrée au code de PalCMS (`apps/server/src/extensions/market.ts`) ;
5. vérifie que le `id` et le `type` du paquet correspondent à l'entrée du catalogue ;
6. installe l'extension, désactivée pour un plugin : l'admin l'active ensuite.

Un fichier téléchargé depuis le site et installé avec *Installer un fichier .zip* est aussi reconnu comme vérifié, si son empreinte correspond à une ressource du catalogue.

## Signer les ressources

La signature prouve que la ressource a été validée sur le market. Seule la clé privée du market peut la produire.

- **Clé privée** : `market-private.pem`. Garde-la hors de tout dépôt, sur le serveur du market ou sur ta machine.
- **Clé publique** : copiée dans `MARKET_PUBLIC_KEY` (`apps/server/src/extensions/market.ts`).

Pour signer un paquet validé :

```bash
node sdk/palcms-ext.mjs sign bandeau-1.0.0.zip --key market-private.pem --download https://palcms.online/market/files/bandeau-1.0.0.zip
```

La commande affiche l'entrée du catalogue, avec `sha256` et `signature` déjà calculés. Il reste à compléter `iconUrl`, `screenshots` et `url`.

Le site du market peut aussi signer lui-même avec Node.js, au moment où tu valides une ressource :

```js
import crypto from 'node:crypto';
import fs from 'node:fs';

const key = crypto.createPrivateKey(fs.readFileSync('market-private.pem'));
const zip = fs.readFileSync('bandeau-1.0.0.zip');
const sha256 = crypto.createHash('sha256').update(zip).digest('hex');
const signature = crypto.sign(null, zip, key).toString('base64');
```

Ne modifie jamais un `.zip` après l'avoir signé : sa signature ne serait plus valide.

**Si la clé privée est perdue ou volée** : crée-en une nouvelle (`node sdk/palcms-ext.mjs keygen <dossier>`), remplace la clé publique dans PalCMS, publie une nouvelle version, puis signe de nouveau toutes les ressources.

## Tester en local

`pnpm dev` lance aussi un faux market (`tools/fake-market`) sur `http://127.0.0.1:3100/api/market`. Il construit les exemples de `sdk/examples`, les signe avec une clé de développement et les sert au format ci-dessus. Le PalCMS de dev fait confiance à cette clé grâce à `PALCMS_TRUSTED_KEYS`, dans `apps/server/.env.development`.
