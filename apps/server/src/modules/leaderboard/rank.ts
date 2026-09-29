import type { LeaderboardEntry } from '@palcms/shared';

export interface RankablePlayer {
  public_id: string;
  name: string;
  level: number;
  online: number;
  playtime_seconds: number;
}

export type RankCriterion = 'level';

/**
 * Classement : niveau décroissant, puis temps de jeu décroissant, puis nom.
 * Les ex æquo parfaits (même niveau et même temps de jeu) partagent le même rang.
 */
export function rankPlayers(rows: RankablePlayer[], limit = 50, _criterion: RankCriterion = 'level'): LeaderboardEntry[] {
  const sorted = [...rows].sort(
    (a, b) => b.level - a.level || b.playtime_seconds - a.playtime_seconds || a.name.localeCompare(b.name),
  );
  const result: LeaderboardEntry[] = [];
  let rank = 0;
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.level !== p.level || prev.playtime_seconds !== p.playtime_seconds) rank = i + 1;
    if (result.length < limit) {
      result.push({
        rank,
        id: p.public_id,
        name: p.name,
        level: p.level,
        online: p.online === 1,
        playtimeSeconds: p.playtime_seconds,
      });
    }
  });
  return result;
}
