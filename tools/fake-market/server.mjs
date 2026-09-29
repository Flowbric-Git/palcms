// Faux market pour le développement : construit les extensions d'exemple (sdk/examples),
// les signe avec la clé de dev et les sert au format de l'API du market (docs/market-api.md).
// Le PalCMS de dev fait confiance à cette clé via PALCMS_TRUSTED_KEYS (.env.development).

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const PORT = Number(process.env.MARKET_PORT ?? 3100);
const base = `http://127.0.0.1:${PORT}`;
// Clé de dev créée au premier lancement (jamais publiée : tools/.dev-data est ignoré par git).
const keyDir = path.join(root, 'tools', '.dev-data');
const privFile = path.join(keyDir, 'market-dev-private.pem');
if (!fs.existsSync(privFile)) {
  fs.mkdirSync(keyDir, { recursive: true });
  const pair = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(privFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  fs.writeFileSync(path.join(keyDir, 'market-dev-public.pem'), pair.publicKey.export({ type: 'spki', format: 'pem' }));
}
const key = crypto.createPrivateKey(fs.readFileSync(privFile));

const EXAMPLES = ['plugin-bandeau', 'theme-aurora'];

const resources = [];
const files = new Map();
for (const name of EXAMPLES) {
  const dir = path.join(root, 'sdk', 'examples', name);
  const res = spawnSync(process.execPath, [path.join(root, 'sdk', 'palcms-ext.mjs'), 'build', dir], { stdio: 'pipe', encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`[market] ${name} : ${res.stderr || res.stdout}`);
    continue;
  }
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'palcms.json'), 'utf8'));
  const zipName = `${m.id}-${m.version}.zip`;
  const data = fs.readFileSync(path.join(dir, zipName));
  files.set(zipName, data);
  files.set(`${m.id}.png`, fs.readFileSync(path.join(dir, m.icon)));
  resources.push({
    id: m.id,
    type: m.type,
    name: m.name,
    summary: m.description ?? '',
    author: m.author ?? '',
    version: m.version,
    iconUrl: `${base}/files/${m.id}.png`,
    downloads: 100 + resources.length * 37,
    palcms: m.palcms,
    download: `${base}/files/${zipName}`,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    signature: crypto.sign(null, data, key).toString('base64'),
    updatedAt: new Date().toISOString(),
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', base);
    if (url.pathname === '/api/market/resources') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ resources }));
    }
    const file = url.pathname.startsWith('/files/') ? files.get(url.pathname.slice(7)) : undefined;
    if (file) {
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.png') ? 'image/png' : 'application/zip', 'Content-Length': file.length });
      return res.end(file);
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"error":"Introuvable"}');
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[market] faux market sur ${base}/api/market/resources (${resources.map((r) => r.id).join(', ')})`);
  });
