# Market API

This document describes what the market site (palcms.online) must provide so that every PalCMS can show the catalogue and install resources in one click.

## Address

By default, PalCMS queries `https://palcms.online/api/market`. To test with another market, add `PALCMS_MARKET_URL=https://…/api/market` to `/etc/palcms/config.env`, then restart the CMS with `sudo systemctl restart palcms`.

## Catalogue

`GET /api/market/resources` returns every published resource (JSON, status 200):

```json
{
  "resources": [
    {
      "id": "bandeau",
      "type": "plugin",
      "name": "Announcement banner",
      "summary": "A banner at the top of the site to announce an event or a maintenance.",
      "author": "PalCMS",
      "version": "1.1.0",
      "palcms": ">=1.0.1",
      "iconUrl": "https://palcms.online/market/bandeau/icon.png",
      "screenshots": ["https://palcms.online/market/bandeau/1.png"],
      "downloads": 128,
      "price": 0,
      "url": "https://palcms.online/market/bandeau",
      "download": "https://palcms.online/market/files/bandeau-1.1.0.zip",
      "sha256": "9f2c…",
      "signature": "k3Jd…==",
      "updatedAt": "2026-10-01T12:00:00Z"
    }
  ]
}
```

| Field | Required | Role |
|---|---|---|
| `id` | yes | same as the `id` of `palcms.json` in the package |
| `type` | yes | `plugin` or `theme`, same as the package |
| `name`, `version` | yes | `version` in the `1.2.3` format (latest published version) |
| `summary`, `author` | no | shown on the resource card |
| `palcms` | no | compatible PalCMS versions (`>=1.0.1`): the Install button is hidden elsewhere |
| `iconUrl`, `screenshots` | no | absolute URLs (the first screenshot is the card image) |
| `downloads`, `price`, `url`, `updatedAt` | no | displayed information; `url` opens the resource page |
| `download` | yes | absolute URL of the `.zip` (20 MB maximum) |
| `sha256` | yes | SHA-256 checksum of the `.zip`, in hexadecimal |
| `signature` | yes | Ed25519 signature of the `.zip`, in base64 |

A malformed entry is skipped without blocking the others. PalCMS caches the catalogue for 10 minutes: the panel *Refresh* button forces a new read.

## Install

When the admin clicks *Install* (or *Update*), PalCMS:

1. reads the catalogue again and checks that the resource is compatible with its version;
2. downloads `download`;
3. compares the SHA-256 checksum with `sha256`;
4. checks `signature` with the market public key, built into the PalCMS code (`apps/server/src/extensions/market.ts`);
5. checks that the package `id` and `type` match the catalogue entry;
6. installs the extension, turned off for a plugin: the admin then turns it on.

A file downloaded from the site and installed with *Install a .zip file* is also recognized as verified when its checksum matches a catalogue resource.

## Signing resources

The signature proves that the resource was approved on the market. Only the market private key can produce it.

- **Private key**: `market-private.pem`. Keep it out of every repository, on the market server or on your machine.
- **Public key**: copied into `MARKET_PUBLIC_KEY` (`apps/server/src/extensions/market.ts`).

To sign an approved package:

```bash
node sdk/palcms-ext.mjs sign bandeau-1.1.0.zip --key market-private.pem --download https://palcms.online/market/files/bandeau-1.1.0.zip
```

The command prints the catalogue entry, with `sha256` and `signature` already computed. `iconUrl`, `screenshots` and `url` remain to be filled in.

The market site can also sign by itself with Node.js, when you approve a resource:

```js
import crypto from 'node:crypto';
import fs from 'node:fs';

const key = crypto.createPrivateKey(fs.readFileSync('market-private.pem'));
const zip = fs.readFileSync('bandeau-1.1.0.zip');
const sha256 = crypto.createHash('sha256').update(zip).digest('hex');
const signature = crypto.sign(null, zip, key).toString('base64');
```

Never change a `.zip` after signing it: its signature would no longer be valid.

**If the private key is lost or stolen**: create a new one (`node sdk/palcms-ext.mjs keygen <folder>`), replace the public key in PalCMS, publish a new version, then sign every resource again.

## Testing locally

`pnpm dev` also starts a fake market (`tools/fake-market`) at `http://127.0.0.1:3100/api/market`. It builds the examples of `sdk/examples`, signs them with a development key and serves them in the format above. The dev PalCMS trusts this key through `PALCMS_TRUSTED_KEYS`, in `apps/server/.env.development`.
