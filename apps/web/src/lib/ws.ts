import { useEffect, useRef } from 'react';
import type { Channel, WsServerMessage } from '@palcms/shared';
import { isDemo, url } from './api';

type Listener = (msg: WsServerMessage) => void;

/**
 * A single WebSocket connection shared by the whole app, with automatic reconnection
 * and channel re-subscription after a drop.
 */
class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Map<Channel, Set<Listener>>();
  private retry = 0;
  private timer: number | null = null;

  private demoOff: (() => void) | null = null;

  private connect() {
    if (isDemo) {
      if (!this.demoOff) {
        void import('../demo/engine').then(({ onDemoMessage }) => {
          this.demoOff ??= onDemoMessage((msg) => {
            for (const set of this.listeners.values()) for (const l of set) l(msg);
          });
        });
      }
      return;
    }
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}${url('ws')}`);
    this.socket = ws;
    ws.onopen = () => {
      this.retry = 0;
      for (const ch of this.listeners.keys()) ws.send(JSON.stringify({ type: 'sub', channel: ch }));
    };
    ws.onmessage = (ev) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      for (const set of this.listeners.values()) for (const l of set) l(msg);
    };
    ws.onclose = () => {
      // An old connection closed on purpose must not start a second one.
      if (this.socket !== ws) return;
      this.socket = null;
      if (this.listeners.size === 0) return;
      const delay = Math.min(15000, 1000 * 2 ** this.retry++);
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
  }

  subscribe(channel: Channel, listener: Listener): () => void {
    let set = this.listeners.get(channel);
    const isNew = !set;
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener);
    this.connect();
    if (isNew && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'sub', channel }));

    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.listeners.delete(channel);
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'unsub', channel }));
      }
      if (this.listeners.size === 0) {
        if (this.timer) clearTimeout(this.timer);
        this.socket?.close();
      }
    };
  }

  /** Forces a reconnection (e.g. after logging in: the socket permissions change). */
  reconnect() {
    const old = this.socket;
    this.socket = null;
    old?.close();
    if (this.timer) clearTimeout(this.timer);
    if (this.listeners.size > 0) this.connect();
  }
}

export const realtime = new RealtimeClient();

export function useRealtime(channel: Channel, onMessage: Listener, enabled = true): void {
  const ref = useRef(onMessage);
  ref.current = onMessage;
  useEffect(() => {
    if (!enabled) return;
    return realtime.subscribe(channel, (m) => ref.current(m));
  }, [channel, enabled]);
}
