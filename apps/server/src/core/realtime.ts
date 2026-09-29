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
  /** Messages envoyés immédiatement à un nouvel abonné (état courant). */
  snapshot?: () => WsServerMessage[];
  /** Appelé au premier abonné (ex. démarrer le suivi des logs). */
  onFirst?: () => void;
  /** Appelé quand le dernier abonné part. */
  onLast?: () => void;
}

/**
 * Hub WebSocket.
 * - "public" : tout le monde (statut, joueurs, classement, carte publique…)
 * - "setup"  : assistant d'installation
 * - "logs"   : logs du serveur (permission server.logs)
 * - "admin"  : événements réservés à l'équipe (carte privée…)
 */
class RealtimeHub {
  private clients = new Set<Client>();
  private hooks = new Map<Channel, ChannelHooks>();
  /** Instantanés supplémentaires fournis par des modules (ex. positions de la carte). */
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
      this.send(client, { type: 'error', data: `Accès refusé au canal ${channel}` });
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
        /* un module défaillant ne doit pas couper la connexion */
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
