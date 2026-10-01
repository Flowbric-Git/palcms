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

describe('full leaderboard', () => {
  const rows = [row('a', 10, 500, 300, 5), row('b', 20, 100, 100, 50), row('c', 10, 900, 200, 5)];

  it('sorts by each criterion', () => {
    expect(rankBy(rows, 'level').map((e) => e.name)).toEqual(['b', 'c', 'a']);
    expect(rankBy(rows, 'playtime').map((e) => e.name)).toEqual(['c', 'a', 'b']);
    expect(rankBy(rows, 'seniority').map((e) => e.name)).toEqual(['b', 'c', 'a']);
    expect(rankBy(rows, 'buildings').map((e) => e.name)).toEqual(['b', 'a', 'c']);
  });

  it('shares the rank when the shown value is the same', () => {
    expect(rankBy(rows, 'buildings').map((e) => e.rank)).toEqual([1, 2, 2]);
  });
});

describe('backups', () => {
  const out = [
    'palworld-20260929-100000-auto.tar.gz\t100\t1790676000.5',
    'palworld-20260929-110000-auto.tar.gz\t200\t1790679600.1',
    'palworld-20260929-113000-manual.tar.gz\t300\t1790681400',
    'fichier-etranger.tar.gz\t1\t1',
    '',
  ].join('\n');

  it('reads the palctl output and ignores unknown files', () => {
    const items = parseBackupList(out);
    expect(items.map((b) => b.name)).toEqual([
      'palworld-20260929-113000-manual.tar.gz',
      'palworld-20260929-110000-auto.tar.gz',
      'palworld-20260929-100000-auto.tar.gz',
    ]);
    expect(items[0]).toMatchObject({ tag: 'manual', size: 300, createdAt: 1790681400000 });
  });

  it('only deletes the oldest automatic backups', () => {
    expect(backupsToPrune(parseBackupList(out), 1)).toEqual(['palworld-20260929-100000-auto.tar.gz']);
    expect(backupsToPrune(parseBackupList(out), 5)).toEqual([]);
  });
});

describe('schedules', () => {
  it('computes the next occurrence of a time', () => {
    const from = new Date(2026, 8, 29, 10, 0, 0).getTime();
    expect(new Date(nextOccurrence('12:30', from))).toEqual(new Date(2026, 8, 29, 12, 30, 0));
    expect(new Date(nextOccurrence('06:00', from))).toEqual(new Date(2026, 8, 30, 6, 0, 0));
    expect(new Date(nextOccurrence('10:00', from))).toEqual(new Date(2026, 8, 30, 10, 0, 0));
  });
});

describe('RCON', () => {
  it('encodes and decodes a packet', () => {
    const buf = encodePacket(7, 2, 'ShowPlayers');
    const { packets, rest } = decodePackets(Buffer.concat([buf, buf.subarray(0, 5)]));
    expect(packets).toEqual([{ id: 7, type: 2, body: 'ShowPlayers' }]);
    expect(rest.length).toBe(5);
  });

  // Fake RCON server: authentication, then the answer to the command.
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

  it('runs a command with the right password', async () => {
    expect(await rconCommand('127.0.0.1', await ready, 'secret', 'Info')).toBe('ok: Info');
  });

  it('refuses a wrong password', async () => {
    await expect(rconCommand('127.0.0.1', await ready, 'wrong', 'Info')).rejects.toThrow(/password refused/);
  });
});
