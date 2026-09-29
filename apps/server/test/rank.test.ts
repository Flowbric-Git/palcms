import { describe, expect, it } from 'vitest';
import { rankPlayers } from '../src/modules/leaderboard/rank';

const p = (id: string, level: number, playtime: number, online = 0) => ({
  public_id: id,
  name: id,
  level,
  online,
  playtime_seconds: playtime,
});

describe('rankPlayers', () => {
  it('trie par niveau puis temps de jeu puis nom', () => {
    const r = rankPlayers([p('bob', 10, 100), p('alice', 20, 50), p('carl', 10, 500), p('dan', 10, 100)]);
    expect(r.map((e) => e.name)).toEqual(['alice', 'carl', 'bob', 'dan']);
  });

  it('donne le même rang aux ex æquo parfaits', () => {
    const r = rankPlayers([p('a', 30, 10), p('b', 20, 5), p('c', 20, 5), p('d', 10, 1)]);
    expect(r.map((e) => e.rank)).toEqual([1, 2, 2, 4]);
  });

  it('respecte la limite et expose uniquement les données publiques', () => {
    const r = rankPlayers([p('a', 3, 0, 1), p('b', 2, 0), p('c', 1, 0)], 2);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ rank: 1, id: 'a', name: 'a', level: 3, online: true, playtimeSeconds: 0 });
  });
});
