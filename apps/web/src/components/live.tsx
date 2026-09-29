import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Crown, Medal, Users } from 'lucide-react';
import type { LeaderboardEntry, PublicPlayer, ServerStatus } from '@palcms/shared';
import { formatDuration } from '../lib/format';
import { Badge, Card, Empty, cx } from './ui';

export function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />}
      <span className={cx('relative inline-flex h-3 w-3 rounded-full', online ? 'bg-green-500' : 'bg-red-500')} />
    </span>
  );
}

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible (HTTP non sécurisé) */
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="group inline-flex items-center gap-2 rounded-lg bg-slate-900/5 px-3 py-2 font-mono text-sm ring-1 ring-slate-900/10 hover:bg-slate-900/10 dark:bg-white/5 dark:ring-white/10 dark:hover:bg-white/10"
      title="Copier l'adresse"
    >
      {address}
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 opacity-60 group-hover:opacity-100" />}
    </button>
  );
}

export function ServerStatusCard({ status }: { status: ServerStatus | null }) {
  if (!status) return <Card className="h-full animate-pulse">&nbsp;</Card>;
  const fill = status.maxPlayers ? Math.min(100, (status.players / status.maxPlayers) * 100) : 0;
  return (
    <Card className="h-full">
      <div className="flex items-center gap-3">
        <StatusDot online={status.online} />
        <span className="text-lg font-semibold">{status.online ? 'Serveur en ligne' : 'Serveur hors ligne'}</span>
      </div>
      <div className="mt-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-500">Joueurs</span>
          <span className="text-2xl font-bold">
            {status.players}
            <span className="text-base font-medium text-slate-400"> / {status.maxPlayers}</span>
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${fill}%` }} />
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800/60">
          <dt className="text-xs text-slate-500">Jour en jeu</dt>
          <dd className="font-semibold">{status.days ?? '—'}</dd>
        </div>
        <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800/60">
          <dt className="text-xs text-slate-500">FPS serveur</dt>
          <dd className="font-semibold">{status.fps ?? '—'}</dd>
        </div>
        <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800/60">
          <dt className="text-xs text-slate-500">En ligne depuis</dt>
          <dd className="font-semibold">{status.uptime != null ? formatDuration(status.uptime) : '—'}</dd>
        </div>
      </dl>
      {status.address && (
        <div className="mt-5">
          <p className="mb-1 text-xs text-slate-500">Adresse du serveur</p>
          <CopyAddress address={status.address} />
        </div>
      )}
    </Card>
  );
}

export function OnlinePlayers({ players }: { players: PublicPlayer[] }) {
  return (
    <Card
      className="h-full"
      title={
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4" /> Joueurs connectés
        </span>
      }
      actions={<Badge tone="accent">{players.length}</Badge>}
    >
      {players.length === 0 ? (
        <Empty>Personne en ligne pour le moment.</Empty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {players.map((p) => (
            <li key={p.id}>
              <Link
                to={`/joueurs/${p.id}`}
                className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2 truncate font-medium">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {p.name}
                </span>
                <span className="text-xs text-slate-500">niv. {p.level}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="w-5 text-center text-sm font-semibold text-slate-500">{rank}</span>;
}

export function LeaderboardTable({ entries, compact = false }: { entries: LeaderboardEntry[] | null; compact?: boolean }) {
  if (!entries) return <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50" />;
  if (entries.length === 0) return <Empty>Aucun joueur classé pour l'instant.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800">
            <th className="py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Joueur</th>
            <th className="py-2 pr-2 text-right font-medium">Niveau</th>
            {!compact && <th className="hidden py-2 text-right font-medium sm:table-cell">Temps de jeu</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
              <td className="py-2 pr-2">
                <RankIcon rank={e.rank} />
              </td>
              <td className="py-2 pr-2">
                <Link to={`/joueurs/${e.id}`} className="flex items-center gap-2 font-medium hover:text-accent">
                  {e.online && <span className="h-2 w-2 rounded-full bg-green-500" title="En ligne" />}
                  {e.name}
                </Link>
              </td>
              <td className="py-2 pr-2 text-right font-semibold tabular-nums">{e.level}</td>
              {!compact && <td className="hidden py-2 text-right text-slate-500 tabular-nums sm:table-cell">{formatDuration(e.playtimeSeconds)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
