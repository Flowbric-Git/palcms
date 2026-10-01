import { describe, expect, it } from 'vitest';
import { translateMessage } from '@palcms/shared';
import { itemName, palName, passiveName } from '../src/gamedata';
import { LIVE_INTERVAL_MS, buildPaldex, liveDelay, parseWorld, worldUidFromPlayerId } from '../src/features/world';
import { itemAnomalies, levelAnomalies } from '../src/features/sanctions';
import { attendanceHeatmap } from '../src/features/monitoring';
import { compareVersions, parseBuildIds } from '../src/features/updates';
import { conflicts, describeValues, filterGameValues } from '../src/features/events';
import { validatePalctlArgs } from '../src/palworld/palctlArgs';

describe('world data', () => {
  it('links the REST API PlayerUId to the sav_cli id', () => {
    expect(worldUidFromPlayerId('9E967EB0000000000000000000000000')).toBe(String(0x9e967eb0));
    expect(worldUidFromPlayerId('9e967eb0-0000-0000-0000-000000000000')).toBe(String(0x9e967eb0));
    expect(worldUidFromPlayerId('')).toBeNull();
    expect(worldUidFromPlayerId('xyz')).toBeNull();
  });

  it('cleans the sav_cli export', () => {
    const w = parseWorld(
      JSON.stringify({
        players: [{ player_uid: '42', nickname: 'Lyra', level: 12, pals: [{ type: 'SheepBall', level: 3 }, { level: 1 }], items: {} }, { nickname: 'sans uid' }],
        guilds: [{ name: 'Guilde', admin_player_uid: '42', players: [{ player_uid: '42', nickname: 'Lyra' }], base_camp: [{ id: '1', location_x: 1, location_y: 2 }] }],
      }),
    );
    expect(w.players).toHaveLength(1);
    expect(w.players[0].pals).toHaveLength(1);
    expect(w.guilds[0].base_camp).toHaveLength(1);
    expect(() => parseWorld('{"players": 1}')).toThrow();
  });

  it('builds the full Paldex by number, alphas counted with their species', () => {
    const dex = buildPaldex([
      { type: 'SheepBall', owner: '1', lucky: 0, alpha: 0, level: 5 },
      { type: 'BOSS_SheepBall', owner: '2', lucky: 1, alpha: 1, level: 12 },
      { type: 'Inconnu', owner: '1', lucky: 0, alpha: 0, level: 1 },
    ]);
    expect(dex).toHaveLength(288);
    expect(dex[0]).toMatchObject({ no: '001', name: 'Lamball', count: 2, owners: 2, lucky: 1, alpha: 1, maxLevel: 12 });
    expect(dex.filter((e) => e.count > 0)).toHaveLength(1);
  });


  it('reads the export case-insensitively (sav_cli writes "Sheepball")', () => {
    const dex = buildPaldex([{ type: 'Sheepball', owner: '1', lucky: 0, alpha: 0, level: 2 }]);
    expect(dex[0]).toMatchObject({ no: '001', count: 1 });
  });

  it('paces the live read: 30 s, slower when the world takes long to read', () => {
    expect(liveDelay(0)).toBe(LIVE_INTERVAL_MS);
    expect(liveDelay(4000)).toBe(LIVE_INTERVAL_MS);
    expect(liveDelay(20_000)).toBe(80_000);
  });
  it('turns game ids into names', () => {
    expect(palName('SheepBall')).toBe('Lamball');
    expect(palName('BOSS_Anubis')).toBe('Anubis');
    expect(palName('SomeUnknownPal')).toBe('Some Unknown Pal');
    expect(itemName('palsphere')).toBe('Pal Sphere');
    expect(itemName('inconnu_42')).toBe('inconnu_42');
    expect(passiveName('Legend')).toBe('Legend');
  });
});

describe('anti-cheat', () => {
  const s = { levelJump: 6, levelsPerHour: 20, itemStack: 20000, money: 10_000_000 };
  const now = 10_000_000;

  it('spots levelling that is too fast', () => {
    expect(levelAnomalies([{ ts: now - 120_000, level: 10 }, { ts: now, level: 17 }], now, s)[0].kind).toBe('level-jump');
    expect(levelAnomalies([{ ts: now - 50 * 60_000, level: 10 }, { ts: now - 20 * 60_000, level: 20 }, { ts: now, level: 31 }], now, s)[0].kind).toBe('level-rate');
    expect(levelAnomalies([{ ts: now - 50 * 60_000, level: 10 }, { ts: now, level: 14 }], now, s)).toEqual([]);
  });

  it('spots abnormal item amounts', () => {
    const found = itemAnomalies(
      {
        CommonContainerId: [
          { ItemId: 'stone', StackCount: 15000 },
          { ItemId: 'stone', StackCount: 9000 },
          { ItemId: 'money', StackCount: 500000 },
        ],
      },
      s,
    );
    expect(found.map((f) => f.kind)).toEqual(['items:stone']);
  });
});

describe('attendance', () => {
  it('counts the hours played per weekday', () => {
    // Lundi 5 janvier 2026, 20 h -> 22 h (heure locale)
    const start = new Date(2026, 0, 5, 20, 0).getTime();
    const grid = attendanceHeatmap([{ started_at: start, ended_at: start + 2 * 3600_000 }], start - 86_400_000, start + 6 * 86_400_000);
    expect(grid[0][20]).toBe(1);
    expect(grid[0][21]).toBe(1);
    expect(grid[0][22]).toBe(0);
  });
});

describe('updates', () => {
  it('compares versions', () => {
    expect(compareVersions('v1.2.0', '1.0.2')).toBeGreaterThan(0);
    expect(compareVersions('1.0.2', 'v1.0.2')).toBe(0);
    expect(compareVersions('1.0.9', '1.0.10')).toBeLessThan(0);
  });

  it('reads the palctl check-update output', () => {
    expect(parseBuildIds('installed=123\nlatest=456\n')).toEqual({ installed: '123', latest: '456' });
    expect(parseBuildIds('installed=\nlatest=\n')).toEqual({ installed: null, latest: null });
  });

  it('allows the new palctl commands with safe arguments', () => {
    expect(validatePalctlArgs(['world-export'])).toBeNull();
    expect(validatePalctlArgs(['self-update', 'v1.2.0'])).toBeNull();
    expect(validatePalctlArgs(['self-update', '1.2.0; rm -rf /'])).not.toBeNull();
    expect(validatePalctlArgs(['world-export', '/etc/shadow'])).not.toBeNull();
  });
});

describe('events and presets', () => {
  it('only keeps gameplay settings', () => {
    const known = new Set(['ExpRate', 'AdminPassword', 'PublicPort', 'Difficulty']);
    expect(filterGameValues({ ExpRate: 3, AdminPassword: 'x', PublicPort: 1, Inconnu: 1, Difficulty: 'Hard' }, known)).toEqual({ ExpRate: 3, Difficulty: 'Hard' });
  });

  it('detects two events overlapping on the same setting', () => {
    const a = { startsAt: 0, endsAt: 100, values: { ExpRate: 3 } };
    expect(conflicts(a, { startsAt: 50, endsAt: 150, values: { ExpRate: 2 } })).toEqual(['ExpRate']);
    expect(conflicts(a, { startsAt: 100, endsAt: 150, values: { ExpRate: 2 } })).toEqual([]);
    expect(conflicts(a, { startsAt: 50, endsAt: 150, values: { PalCaptureRate: 2 } })).toEqual([]);
  });

  it('describes the changes, in English or translated', () => {
    expect(describeValues({ ExpRate: 3, bIsPvP: true })).toEqual(['Experience rate: x3', 'PvP: on']);
    expect(describeValues({ ExpRate: 3, bIsPvP: true }).map((m) => translateMessage('fr', m))).toEqual(["Taux d'expérience : x3", 'PvP : activé']);
  });
});
