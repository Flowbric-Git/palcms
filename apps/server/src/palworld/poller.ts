import crypto from 'node:crypto';
import type { LeaderboardEntry, PublicPlayer, ServerStatus } from '@palcms/shared';
import { db } from '../db';
import { config } from '../config';
import { realtime } from '../core/realtime';
import { events } from '../core/events';
import { getPalworldConfig, isSetupDone, palworldConnection, secretSalt, serverAddress } from '../core/site';
import { modules } from '../core/modules';
import { rankPlayers, type RankablePlayer } from '../modules/leaderboard/rank';
import { palworld, type PalInfo, type PalMetrics, type PalPlayer } from './restClient';

/** Stable public id of a player, derived from their Palworld id (never exposed). */
export function publicPlayerId(uid: string): string {
  return crypto.createHmac('sha256', secretSalt()).update(uid).digest('hex').slice(0, 12);
}

class Poller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastTick = 0;
  private lastMetricsSave = 0;
  private info: PalInfo | null = null;
  private infoAt = 0;
  private status: ServerStatus | null = null;
  private metrics: PalMetrics | null = null;
  private online: PalPlayer[] = [];

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), config.pollIntervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Forgets the previous server state (e.g. after connecting another server). */
  reset(): void {
    this.info = null;
    this.infoAt = 0;
    this.status = null;
    this.online = [];
    this.lastTick = 0;
    void this.tick();
  }

  getStatus(): ServerStatus {
    return this.status ?? this.offlineStatus();
  }

  getMetrics(): PalMetrics | null {
    return this.status?.online ? this.metrics : null;
  }

  /** Online players, with their private data (admin only). */
  getOnlineRaw(): PalPlayer[] {
    return this.online;
  }

  getPublicPlayers(): PublicPlayer[] {
    return this.online.map((p) => ({ id: publicPlayerId(p.userId), name: p.name, level: p.level, online: true }));
  }

  getLeaderboard(limit = 50): LeaderboardEntry[] {
    const rows = db
      .prepare<[], RankablePlayer>('SELECT public_id, name, level, online, playtime_seconds FROM players')
      .all();
    return rankPlayers(rows, limit);
  }

  private offlineStatus(): ServerStatus {
    const pal = isSetupDone() ? getPalworldConfig() : null;
    const connected = isSetupDone() && !!palworldConnection();
    return {
      online: false,
      name: this.info?.servername ?? pal?.serverName ?? '',
      version: this.info?.version ?? null,
      players: 0,
      maxPlayers: pal?.maxPlayers ?? 0,
      fps: null,
      days: null,
      uptime: null,
      address: connected ? serverAddress() : '',
      updatedAt: Date.now(),
    };
  }

  async tick(): Promise<void> {
    if (this.running || !isSetupDone()) return;
    if (!palworldConnection()) {
      // Website only: no server connected, just broadcast an offline status.
      this.status = this.offlineStatus();
      this.online = [];
      return;
    }
    this.running = true;
    try {
      const now = Date.now();
      let metrics: PalMetrics | null = null;
      let players: PalPlayer[] | null = null;
      try {
        [metrics, players] = await Promise.all([palworld.metrics(), palworld.players()]);
        if (!this.info || now - this.infoAt > 60_000) {
          this.info = await palworld.info();
          this.infoAt = now;
        }
      } catch {
        metrics = null;
        players = null;
      }

      const elapsed = this.lastTick ? Math.min((now - this.lastTick) / 1000, (config.pollIntervalMs * 3) / 1000) : 0;
      this.lastTick = now;
      const wasOnline = this.status?.online ?? null;
      this.recordPlayers(players ?? [], now, Math.round(elapsed));
      this.online = players ?? [];
      this.metrics = metrics;

      if (metrics) {
        const pal = getPalworldConfig();
        this.status = {
          online: true,
          name: this.info?.servername ?? pal?.serverName ?? '',
          version: this.info?.version ?? null,
          players: metrics.currentplayernum,
          maxPlayers: metrics.maxplayernum || pal?.maxPlayers || 0,
          fps: metrics.serverfps,
          days: metrics.days ?? null,
          uptime: metrics.uptime,
          address: serverAddress(),
          updatedAt: now,
        };
        if (now - this.lastMetricsSave >= 60_000) {
          this.lastMetricsSave = now;
          db.prepare('INSERT OR REPLACE INTO metrics (ts, fps, players, frame_time, days) VALUES (?, ?, ?, ?, ?)').run(
            now,
            metrics.serverfps,
            metrics.currentplayernum,
            metrics.serverframetime,
            metrics.days ?? null,
          );
          db.prepare('DELETE FROM metrics WHERE ts < ?').run(now - 30 * 24 * 3600 * 1000);
        }
      } else {
        this.status = this.offlineStatus();
      }

      this.broadcast();
      const isOnline = this.getStatus().online;
      if (wasOnline !== null && wasOnline !== isOnline) events.emit(isOnline ? 'server:online' : 'server:offline', {});
      events.emit('tick', { players: this.online, status: this.getStatus() });
    } finally {
      this.running = false;
    }
  }

  /** Updates the players table: presence, level, sessions and total playtime. */
  private recordPlayers(players: PalPlayer[], now: number, elapsedSec: number): void {
    const seen = new Set<string>();
    const joined: { uid: string; name: string }[] = [];
    const left: { uid: string; name: string }[] = [];
    const getOnline = db.prepare<[string], { online: number }>('SELECT online FROM players WHERE uid = ?');
    const upsert = db.prepare(
      `INSERT INTO players (uid, public_id, player_id, name, account_name, level, building_count, online, first_seen, last_seen, playtime_seconds, last_x, last_y)
       VALUES (@uid, @publicId, @playerId, @name, @accountName, @level, @buildings, 1, @now, @now, 0, @x, @y)
       ON CONFLICT(uid) DO UPDATE SET
         player_id = excluded.player_id, name = excluded.name, account_name = excluded.account_name,
         level = MAX(players.level, excluded.level), building_count = excluded.building_count, online = 1,
         last_seen = excluded.last_seen, playtime_seconds = players.playtime_seconds + @add,
         last_x = excluded.last_x, last_y = excluded.last_y`,
    );
    const openSession = db.prepare('INSERT INTO player_sessions (uid, started_at) VALUES (?, ?)');
    const closeSessions = db.prepare('UPDATE player_sessions SET ended_at = ? WHERE uid = ? AND ended_at IS NULL');
    const setOffline = db.prepare('UPDATE players SET online = 0 WHERE uid = ?');

    db.transaction(() => {
      for (const p of players) {
        if (!p.userId || seen.has(p.userId)) continue;
        seen.add(p.userId);
        const wasOnline = getOnline.get(p.userId)?.online === 1;
        upsert.run({
          uid: p.userId,
          publicId: publicPlayerId(p.userId),
          playerId: p.playerId ?? null,
          name: p.name || p.accountName || 'Inconnu',
          accountName: p.accountName ?? null,
          level: Number(p.level) || 0,
          buildings: Number(p.building_count) || 0,
          now,
          x: Number.isFinite(p.location_x) ? p.location_x : null,
          y: Number.isFinite(p.location_y) ? p.location_y : null,
          add: wasOnline ? elapsedSec : 0,
        });
        if (!wasOnline) {
          openSession.run(p.userId, now);
          joined.push({ uid: p.userId, name: p.name });
        }
      }
      const stillOnline = db.prepare<[], { uid: string; name: string }>('SELECT uid, name FROM players WHERE online = 1').all();
      for (const { uid, name } of stillOnline) {
        if (seen.has(uid)) continue;
        setOffline.run(uid);
        closeSessions.run(now, uid);
        left.push({ uid, name });
      }
    })();
    for (const j of joined) events.emit('player:join', j);
    for (const l of left) events.emit('player:leave', l);
  }

  private broadcast(): void {
    realtime.broadcast('public', { type: 'status', data: this.getStatus() });
    if (modules.isEnabled('status')) realtime.broadcast('public', { type: 'players', data: this.getPublicPlayers() });
    if (modules.isEnabled('leaderboard')) realtime.broadcast('public', { type: 'leaderboard', data: this.getLeaderboard(20) });
  }
}

export const poller = new Poller();

realtime.setHooks('public', {
  snapshot: () => [
    { type: 'status', data: poller.getStatus() },
    ...(modules.isEnabled('status') ? [{ type: 'players' as const, data: poller.getPublicPlayers() }] : []),
    ...(modules.isEnabled('leaderboard') ? [{ type: 'leaderboard' as const, data: poller.getLeaderboard(20) }] : []),
  ],
});
