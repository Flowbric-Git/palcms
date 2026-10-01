#!/usr/bin/env node
// Fake palctl for development: same interface as scripts/palctl, but touches nothing.
// It simulates the install (with delays) and the palworld service through tools/.dev-data/state.json.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DEV_DIR, INI_FILE, LOG_FILE, appendLog, readState, writeState } from '../dev-state.mjs';

const BACKUP_DIR = path.join(DEV_DIR, 'backups');
const BACKUP_RE = /^palworld-\d{8}-\d{6}-(manual|auto|prerestart|preupdate|prerestore)\.tar\.gz$/;

const FAST = process.env.PALCTL_FAST === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? 0 : ms));
const out = (s) => process.stdout.write(s + '\n');
const die = (msg, code = 2) => {
  process.stderr.write(`palctl: ${msg}\n`);
  process.exit(code);
};

// Simulated world in the sav_cli format, matching the players of the fake server (tools/fake-palworld-api).
const PLAYER_NAMES = ['Lyra', 'Kaito', 'Nova', 'Bastien', 'Mira', 'Oskar', 'Zelie', 'Tanuki'];
const PAL_TYPES = ['SheepBall', 'PinkCat', 'ChickenPal', 'Kitsunebi', 'Penguin', 'Carbunclo', 'Anubis', 'BOSS_Anubis', 'JetDragon', 'Garm', 'WoolFox', 'Mutant', 'FlameBuffalo', 'LazyDragon', 'ThunderDragonMan', 'HadesBird', 'SakuraSaurus', 'Alpaca', 'GrassMammoth', 'NightFox'];
const PASSIVES = ['Rare', 'Legend', 'CraftSpeed_up2', 'PAL_ALLAttack_up2', 'Deffence_up1', 'ElementBoost_Fire_2_PAL', 'Nocturnal', 'TrainerMining_up1'];
const ITEMS = [['money', 50000], ['stone', 900], ['wood', 700], ['palsphere', 40], ['palsphere_mega', 15], ['copperingot', 120], ['berries', 60], ['honey', 12], ['palfluid', 30], ['cloth', 80]];

function fakeWorld() {
  let seed = 1234;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const players = PLAYER_NAMES.map((name, i) => {
    const level = 8 + Math.floor(rnd() * 42);
    const pals = Array.from({ length: 4 + Math.floor(rnd() * 22) }, () => ({
      nickname: rnd() < 0.15 ? `${name.slice(0, 3)}${Math.floor(rnd() * 90 + 10)}` : '',
      level: 1 + Math.floor(rnd() * level),
      exp: 0,
      hp: 500,
      max_hp: 0,
      type: PAL_TYPES[Math.floor(rnd() * PAL_TYPES.length)],
      gender: rnd() < 0.5 ? 'Male' : 'Female',
      is_lucky: rnd() < 0.05,
      is_boss: false,
      is_tower: false,
      workspeed: 70,
      melee: Math.floor(rnd() * 100),
      ranged: Math.floor(rnd() * 100),
      defense: Math.floor(rnd() * 100),
      rank: 1 + Math.floor(rnd() * 4),
      rank_attack: 0,
      rank_defence: 0,
      rank_craftspeed: 0,
      skills: PASSIVES.filter(() => rnd() < 0.2),
    }));
    for (const p of pals) p.is_boss = p.type.startsWith('BOSS_');
    const common = ITEMS.filter(() => rnd() < 0.7).map(([id, max], slot) => ({ SlotIndex: slot, ItemId: id, StackCount: 1 + Math.floor(rnd() * max) }));
    // Nova has an abnormal stock: the anti-cheat must spot it.
    if (name === 'Nova') common.push({ SlotIndex: 20, ItemId: 'palsphere_legend', StackCount: 45000 });
    return {
      player_uid: String(0xa1b2c3 + i),
      nickname: name,
      level,
      exp: level * 1000,
      hp: 50000,
      max_hp: 0,
      shield_hp: 0,
      shield_max_hp: 0,
      max_status_point: 0,
      status_point: { 最大HP: Math.floor(rnd() * 20), 最大SP: Math.floor(rnd() * 10), 攻撃力: Math.floor(rnd() * 15), 所持重量: Math.floor(rnd() * 20) },
      full_stomach: 80,
      pals,
      items: {
        CommonContainerId: common,
        EssentialContainerId: [{ SlotIndex: 0, ItemId: 'glider_good', StackCount: 1 }],
        WeaponLoadOutContainerId: [{ SlotIndex: 0, ItemId: 'assaultrifle_default1', StackCount: 1 }],
        PlayerEquipArmorContainerId: [{ SlotIndex: 0, ItemId: 'clotharmor', StackCount: 1 }],
        FoodEquipContainerId: [{ SlotIndex: 0, ItemId: 'baked_berries', StackCount: 10 }],
        DropSlotContainerId: [],
      },
    };
  });
  const guild = (name, members, level, bases) => ({
    name,
    base_camp_level: level,
    admin_player_uid: players[members[0]].player_uid,
    players: members.map((m) => ({ player_uid: players[m].player_uid, nickname: players[m].nickname, last_online: new Date().toISOString() })),
    base_ids: bases.map((_, i) => `${name}-${i}`),
    base_camp: bases.map(([x, y], i) => ({ id: `${name.length}${i}${members[0]}`, area: 3500, location_x: x, location_y: y })),
  });
  return {
    players,
    guilds: [
      guild('The Pioneers', [0, 1, 2], 18, [[-250000, 150000], [-180000, 60000]]),
      guild('Order of the Phoenix', [3, 4, 5], 14, [[-420000, -60000]]),
      guild('Tanuki Corp', [6, 7], 7, [[-60000, 220000]]),
    ],
  };
}

const [cmd, ...args] = process.argv.slice(2);
const state = readState();

async function main() {
  switch (cmd) {
    case 'install-deps': {
      for (const l of [
        '==> Enabling the multiverse repository and the i386 architecture',
        'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease',
        'Reading package lists... Done',
        '==> Installing steamcmd and lib32gcc-s1',
        'Setting up lib32gcc-s1 (14.2.0-4ubuntu2) ...',
        'Setting up steamcmd:i386 (0~20180105-5) ...',
        '==> Creating the steam user',
        '✔ Dependencies installed (simulation)',
      ]) {
        out(l);
        await sleep(350);
      }
      state.depsInstalled = true;
      break;
    }
    case 'install-palworld': {
      if (!state.depsInstalled) die('steamcmd missing: run install-deps first', 3);
      out('Redirecting stderr to /home/steam/Steam/logs/stderr.txt');
      out('[  0%] Checking for available updates...');
      await sleep(400);
      for (let p = 0; p <= 100; p += 8) {
        out(` Update state (0x61) downloading, progress: ${Math.min(p, 100).toFixed(2)} (${Math.round(p * 38.5)}000000 / 3850000000)`);
        await sleep(250);
      }
      out(" Success! App '2394010' fully installed.");
      out('==> steamclient.so copied to ~/.steam/sdk64');
      state.palworldInstalled = true;
      break;
    }
    case 'update-palworld':
      await sleep(1500);
      state.palworldUpdated = true;
      out(" Success! App '2394010' fully installed.");
      break;
    case 'write-service': {
      const [port, players] = args;
      state.service.port = Number(port);
      state.service.players = Number(players);
      out(`==> /etc/systemd/system/palworld.service written (port ${port}, ${players} players)`);
      break;
    }
    case 'service': {
      const action = args[0];
      const s = state.service;
      if (action === 'is-active' || action === 'status') {
        out(s.active ? 'active' : 'inactive');
        if (!s.active) process.exit(3);
        break;
      }
      if (action === 'enable') {
        s.enabled = true;
        out('Created symlink /etc/systemd/system/multi-user.target.wants/palworld.service');
        break;
      }
      if (action === 'start' || action === 'restart') {
        if (!state.palworldInstalled) die('Palworld not installed', 5);
        if (!fs.existsSync(INI_FILE)) die('PalWorldSettings.ini missing', 5);
        await sleep(600);
        s.active = true;
        appendLog(action === 'restart' ? 'Server restarted' : 'Server started');
        appendLog('Running Palworld dedicated server on :' + s.port);
        break;
      }
      if (action === 'stop') {
        await sleep(400);
        s.active = false;
        appendLog('Server stopped');
        break;
      }
      die(`unknown action: ${action}`);
      break;
    }
    case 'firewall-open':
      out(`Rule added (${args[0]}/udp)`);
      break;
    case 'write-config': {
      const chunks = [];
      for await (const c of process.stdin) chunks.push(c);
      const content = Buffer.concat(chunks).toString('utf8');
      if (content.length > 65536) die('configuration too large');
      if (!content.startsWith('[/Script/Pal.PalGameWorldSettings]') || !content.includes('OptionSettings=(')) die('invalid configuration');
      fs.writeFileSync(INI_FILE, content);
      out('==> PalWorldSettings.ini updated');
      break;
    }
    case 'read-config':
      if (!fs.existsSync(INI_FILE)) die('PalWorldSettings.ini not found', 3);
      process.stdout.write(fs.readFileSync(INI_FILE, 'utf8'));
      break;
    case 'logs': {
      const n = Number(args[0]) || 100;
      const lines = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n') : ['-- No entries --'];
      out(lines.slice(-n).join('\n'));
      break;
    }
    case 'tail-logs': {
      const events = ['Player joined', 'Autosave completed', 'Player left', 'Tick rate stable (60 FPS)', 'Base camp worker idle'];
      for (;;) {
        await sleep(3000);
        const line = `${new Date().toISOString()} palworld[4242]: ${events[Math.floor(Math.random() * events.length)]}`;
        fs.appendFileSync(LOG_FILE, line + '\n');
        out(line);
      }
    }
    case 'backup-create': {
      if (!['manual', 'auto', 'prerestart', 'preupdate', 'prerestore'].includes(args[0])) die('invalid backup type');
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const name = `palworld-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${args[0]}.tar.gz`;
      await sleep(500);
      fs.writeFileSync(path.join(BACKUP_DIR, name), zlib.gzipSync(`Simulated backup from ${d.toISOString()}\n`.repeat(2000)));
      out(name);
      break;
    }
    case 'backup-list': {
      if (!fs.existsSync(BACKUP_DIR)) break;
      const files = fs.readdirSync(BACKUP_DIR).filter((f) => BACKUP_RE.test(f)).sort().reverse();
      for (const f of files) {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        out(`${f}\t${st.size}\t${(st.mtimeMs / 1000).toFixed(3)}`);
      }
      break;
    }
    case 'backup-restore':
    case 'backup-delete':
    case 'backup-download': {
      if (!BACKUP_RE.test(args[0] ?? '')) die('invalid backup name');
      const file = path.join(BACKUP_DIR, args[0]);
      if (!fs.existsSync(file)) die('backup not found');
      if (cmd === 'backup-delete') {
        fs.rmSync(file);
        out(`==> ${args[0]} deleted`);
      } else if (cmd === 'backup-download') {
        process.stdout.write(fs.readFileSync(file));
      } else {
        const wasActive = state.service.active;
        state.service.active = false;
        await sleep(800);
        appendLog(`World restored from ${args[0]}`);
        state.service.active = wasActive;
        out(`==> World restored from ${args[0]}`);
      }
      break;
    }
    case 'savtools-install':
      await sleep(800);
      state.savtools = true;
      out('✔ sav_cli installed (simulation)');
      break;
    case 'savtools-status':
      out(state.savtools ? 'installed v0.12.2' : 'missing');
      break;
    case 'world-export': {
      if (!state.savtools) die('sav_cli missing (run savtools-install)');
      await sleep(1500);
      process.stdout.write(JSON.stringify(fakeWorld()));
      break;
    }
    case 'check-update':
      out('installed=20111111');
      out(`latest=${state.palworldUpdated ? '20111111' : '20222222'}`);
      break;
    case 'self-update':
      if (!/^v\d+\.\d+\.\d+$/.test(args[0] ?? '')) die('invalid version');
      out(`==> Update to ${args[0]} started (simulation: nothing is installed)`);
      break;
    default:
      die(`unknown command: ${cmd ?? '(empty)'}`);
  }
  writeState(state);
}

await main();
