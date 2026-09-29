// Faux serveur Palworld (API REST v1) pour développer le site sans vrai serveur de jeu.
// Il ne répond que si le "service" simulé est démarré, et fait bouger / progresser des joueurs.
import http from 'node:http';
import { readIniBasics, readState, writeState, appendLog } from '../dev-state.mjs';

const PORT = Number(process.env.FAKE_PAL_PORT ?? 8212);
const NAMES = ['Lyra', 'Kaito', 'Nova', 'Bastien', 'Mira', 'Oskar', 'Zelie', 'Tanuki'];
const startedAt = Date.now();

const players = NAMES.map((name, i) => ({
  name,
  accountName: name.toLowerCase(),
  playerId: (0xa1b2c3 + i).toString(16).toUpperCase().padStart(8, '0'),
  userId: `steam_7656119800000000${i}`,
  ip: `203.0.113.${10 + i}`,
  ping: 20 + i * 7,
  location_x: -300000 + Math.random() * 600000,
  location_y: -300000 + Math.random() * 600000,
  level: 1 + Math.floor(Math.random() * 20),
  building_count: Math.floor(Math.random() * 40),
  online: i < 4,
}));

setInterval(() => {
  for (const p of players) {
    if (Math.random() < 0.04) p.online = !p.online;
    if (!p.online) continue;
    p.location_x += (Math.random() - 0.5) * 8000;
    p.location_y += (Math.random() - 0.5) * 8000;
    p.ping = Math.max(8, Math.round(p.ping + (Math.random() - 0.5) * 10));
    if (Math.random() < 0.03 && p.level < 60) p.level++;
    if (Math.random() < 0.05) p.building_count++;
  }
}, 2000);

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

// FAKE_PAL_PASSWORD défini : simule un serveur "existant", toujours allumé, indépendant de PalCMS
// (pour tester la connexion d'un serveur externe).
const EXTERNAL_PASSWORD = process.env.FAKE_PAL_PASSWORD;

const server = http.createServer((req, res) => {
  const state = readState();
  const ini = EXTERNAL_PASSWORD ? { adminPassword: EXTERNAL_PASSWORD, restPort: PORT, serverName: 'Serveur existant', maxPlayers: 24 } : readIniBasics();
  // Service arrêté : on coupe la connexion, comme un vrai serveur éteint.
  if (!EXTERNAL_PASSWORD && (!state.service.active || !ini)) return req.socket.destroy();

  const auth = req.headers.authorization ?? '';
  const expected = 'Basic ' + Buffer.from(`admin:${ini.adminPassword}`).toString('base64');
  if (auth !== expected) return json(res, 401, { error: 'Unauthorized' });

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const route = (req.url ?? '').replace(/^\/v1\/api\//, '');
    const online = players.filter((p) => p.online);
    switch (`${req.method} ${route}`) {
      case 'GET info':
        return json(res, 200, { version: 'v0.6.4.70000', servername: ini.serverName, description: 'Serveur simulé', worldguid: 'DEV0000' });
      case 'GET metrics':
        return json(res, 200, {
          serverfps: 55 + Math.round(Math.random() * 5),
          currentplayernum: online.length,
          serverframetime: 16.6,
          maxplayernum: ini.maxPlayers,
          uptime: Math.round((Date.now() - startedAt) / 1000),
          days: 1 + Math.floor((Date.now() - startedAt) / 1_200_000),
          basecampnum: 5,
        });
      case 'GET players':
        return json(res, 200, { players: online.map(({ online: _o, ...p }) => p) });
      case 'GET settings':
        return json(res, 200, { ServerName: ini.serverName });
      case 'POST announce':
        appendLog(`[ANNONCE] ${JSON.parse(body || '{}').message ?? ''}`);
        return json(res, 200);
      case 'POST kick':
      case 'POST ban': {
        const { userid } = JSON.parse(body || '{}');
        const p = players.find((x) => x.userId === userid);
        if (p) p.online = false;
        return json(res, 200);
      }
      case 'POST unban':
      case 'POST save':
        return json(res, 200);
      case 'POST shutdown':
      case 'POST stop':
        state.service.active = false;
        writeState(state);
        return json(res, 200);
      default:
        return json(res, 404, { error: 'Not found' });
    }
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`[faux Palworld] API REST simulée sur http://127.0.0.1:${PORT}/v1/api`));
