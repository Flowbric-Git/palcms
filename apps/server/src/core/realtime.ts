import type { WebSocket } from 'ws';
import type { Channel, WsClientMessage, WsServerMessage } from '@palcms/shared';
import type { UserRow } from '../auth/users';
import { hasPermission, isStaff } from './permissions';

interface Client {
  socket: WebSocket;
  channels: Set<Channel>;
  canSetup: boolean;
  user: UserRow | null;
}

interface ChannelHooks {
  /** Messages sent right away to a new subscriber (current state). */
  snapshot?: () => WsServerMessage[];
  /** Called on the first subscriber (e.g. start following logs). */
  onFirst?: () => void;
  /** Called when the last subscriber leaves. */
  onLast?: () => void;
}

/**
 * WebSocket hub.
 * - "public": everyone (status, players, leaderboard, public map…)
 * - "setup" : setup wizard
 * - "logs"  : server logs (server.logs permission)
 * - "admin" : team-only events (private map…)
 */
class RealtimeHub {
  private clients = new Set<Client>();
  private hooks = new Map<Channel, ChannelHooks>();
  /** Extra snapshots provided by modules (e.g. map positions). */
  private extraSnapshots = new Map<Channel, Map<string, () => WsServerMessage[]>>();

  setHooks(channel: Channel, hooks: ChannelHooks): void {
    this.hooks.set(channel, hooks);
  }

  setSnapshot(channel: Channel, key: string, fn: (() => WsServerMessage[]) | null): void {
    let map = this.extraSnapshots.get(channel);
    if (!map) this.extraSnapshots.set(channel, (map = new Map()));
    if (fn) map.set(key, fn);
    else map.delete(key);
  }

  attach(socket: WebSocket, access: { canSetup: boolean; user: UserRow | null }): void {
    const client: Client = { socket, channels: new Set(), ...access };
    this.clients.add(client);

    socket.on('message', (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === 'sub') this.subscribe(client, msg.channel);
      else if (msg.type === 'unsub') this.unsubscribe(client, msg.channel);
    });
    socket.on('close', () => {
      for (const ch of [...client.channels]) this.unsubscribe(client, ch);
      this.clients.delete(client);
    });
  }

  private allowed(client: Client, channel: Channel): boolean {
    switch (channel) {
      case 'public':
        return true;
      case 'setup':
        return client.canSetup || isStaff(client.user);
      case 'logs':
        return hasPermission(client.user, 'server.logs');
      case 'admin':
        return isStaff(client.user);
      default:
        return false;
    }
  }

  private subscribe(client: Client, channel: Channel): void {
    if (!this.allowed(client, channel)) {
      this.send(client, { type: 'error', data: `Access denied to channel ${channel}` });
      return;
    }
    if (client.channels.has(channel)) return;
    const first = this.count(channel) === 0;
    client.channels.add(channel);
    const hooks = this.hooks.get(channel);
    if (first) hooks?.onFirst?.();
    for (const m of hooks?.snapshot?.() ?? []) this.send(client, m);
    for (const fn of this.extraSnapshots.get(channel)?.values() ?? []) {
      try {
        for (const m of fn()) this.send(client, m);
      } catch {
        /* a failing module must not close the connection */
      }
    }
  }

  private unsubscribe(client: Client, channel: Channel): void {
    if (!client.channels.delete(channel)) return;
    if (this.count(channel) === 0) this.hooks.get(channel)?.onLast?.();
  }

  count(channel: Channel): number {
    let n = 0;
    for (const c of this.clients) if (c.channels.has(channel)) n++;
    return n;
  }

  broadcast(channel: Channel, msg: WsServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c.channels.has(channel) && c.socket.readyState === c.socket.OPEN) c.socket.send(payload);
    }
  }

  private send(client: Client, msg: WsServerMessage): void {
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(msg));
  }
}

export const realtime = new RealtimeHub();
