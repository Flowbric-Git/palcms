import net from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { rankBy, type RankRow } from '../src/features/players';
import { backupsToPrune, nextOccurrence, parseBackupList } from '../src/features/operations';
import { decodePackets, encodePacket, rconCommand } from '../src/features/rcon';

const row = (name: string, level: number, playtime: number, firstSeen: number, buildings: number): RankRow => ({
  public_id: name,
  name,
  level,
  online: 0,
  playtime_seconds: playtime,
  first_seen: firstSeen,
  building_count: buildings,
});

describe('classement complet', () => {
  const rows = [row('a', 10, 500, 300, 5), row('b', 20, 100, 100, 50), row('c', 10, 900, 200, 5)];

  it('trie selon chaque critère', () => {
    expect(rankBy(rows, 'level').map((e) => e.name)).toEqual(['b', 'c', 'a']);
    expect(rankBy(rows, 'playtime').map((e) => e.name)).toEqual(['c', 'a', 'b']);
    expect(rankBy(rows, 'seniority').map((e) => e.name)).toEqual(['b', 'c', 'a']);
    expect(rankBy(rows, 'buildings').map((e) => e.name)).toEqual(['b', 'a', 'c']);
  });

  it('partage le rang quand la valeur affichée est identique', () => {
    expect(rankBy(rows, 'buildings').map((e) => e.rank)).toEqual([1, 2, 2]);
  });
});

describe('sauvegardes', () => {
  const out = [
    'palworld-20260929-100000-auto.tar.gz\t100\t1790676000.5',
    'palworld-20260929-110000-auto.tar.gz\t200\t1790679600.1',
    'palworld-20260929-113000-manual.tar.gz\t300\t1790681400',
    'fichier-etranger.tar.gz\t1\t1',
    '',
  ].join('\n');

  it('lit la sortie de palctl et ignore les fichiers inconnus', () => {
    const items = parseBackupList(out);
    expect(items.map((b) => b.name)).toEqual([
      'palworld-20260929-113000-manual.tar.gz',
      'palworld-20260929-110000-auto.tar.gz',
      'palworld-20260929-100000-auto.tar.gz',
    ]);
    expect(items[0]).toMatchObject({ tag: 'manual', size: 300, createdAt: 1790681400000 });
  });

  it('ne supprime que les plus anciennes sauvegardes automatiques', () => {
    expect(backupsToPrune(parseBackupList(out), 1)).toEqual(['palworld-20260929-100000-auto.tar.gz']);
    expect(backupsToPrune(parseBackupList(out), 5)).toEqual([]);
  });
});

describe('programmation', () => {
  it('calcule la prochaine occurrence d’une heure', () => {
    const from = new Date(2026, 8, 29, 10, 0, 0).getTime();
    expect(new Date(nextOccurrence('12:30', from))).toEqual(new Date(2026, 8, 29, 12, 30, 0));
    expect(new Date(nextOccurrence('06:00', from))).toEqual(new Date(2026, 8, 30, 6, 0, 0));
    expect(new Date(nextOccurrence('10:00', from))).toEqual(new Date(2026, 8, 30, 10, 0, 0));
  });
});

describe('RCON', () => {
  it('encode et décode un paquet', () => {
    const buf = encodePacket(7, 2, 'ShowPlayers');
    const { packets, rest } = decodePackets(Buffer.concat([buf, buf.subarray(0, 5)]));
    expect(packets).toEqual([{ id: 7, type: 2, body: 'ShowPlayers' }]);
    expect(rest.length).toBe(5);
  });

  // Faux serveur RCON : authentification puis réponse à la commande.
  const server = net.createServer((sock) => {
    let buf: Buffer = Buffer.alloc(0);
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      const { packets, rest } = decodePackets(buf);
      buf = rest;
      for (const p of packets) {
        if (p.type === 3) sock.write(encodePacket(p.body === 'secret' ? p.id : -1, 2, ''));
        else sock.write(encodePacket(p.id, 0, `ok: ${p.body}`));
      }
    });
  });
  const ready = new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as net.AddressInfo).port)));
  afterAll(() => server.close());

  it('exécute une commande avec le bon mot de passe', async () => {
    expect(await rconCommand('127.0.0.1', await ready, 'secret', 'Info')).toBe('ok: Info');
  });

  it('refuse un mauvais mot de passe', async () => {
    await expect(rconCommand('127.0.0.1', await ready, 'faux', 'Info')).rejects.toThrow(/mot de passe/);
  });
});
