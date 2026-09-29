import { useEffect, useState } from 'react';
import type { LeaderboardEntry, PublicPlayer, ServerStatus } from '@palcms/shared';
import { api } from './api';
import { useRealtime } from './ws';

/** Données du serveur en temps réel : statut, joueurs connectés, top du classement. */
export function useLiveServer() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    api
      .get<{ status: ServerStatus; players: PublicPlayer[] }>('public/status')
      .then((r) => {
        setStatus((s) => s ?? r.status);
        setPlayers(r.players);
      })
      .catch(() => {});
  }, []);

  useRealtime('public', (msg) => {
    if (msg.type === 'status') setStatus(msg.data);
    else if (msg.type === 'players') setPlayers(msg.data);
    else if (msg.type === 'leaderboard') setLeaderboard(msg.data);
  });

  return { status, players, leaderboard };
}
