import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Crown, Hammer, Medal, Trophy } from 'lucide-react';
import type { PlayerProfile } from '@palcms/shared';
import { api } from '../lib/api';
import * as format from '../lib/format';
import * as ui from '../components/ui';
import { useApp } from '../lib/app';
import { BarChart, LineChart } from './components';
import { t } from '../lib/i18n';

const { Badge, Card, Empty, Spinner, cx } = ui;

// Full leaderboard

type RankBy = 'level' | 'playtime' | 'seniority' | 'buildings';

interface RankEntry {
  rank: number;
  id: string;
  name: string;
  level: number;
  online: boolean;
  playtimeSeconds: number;
  firstSeen: number;
  buildings: number;
}

const CRITERIA: { id: RankBy; label: string; Icon: typeof Trophy }[] = [
  { id: 'level', label: 'Level', Icon: Trophy },
  { id: 'playtime', label: 'Playtime', Icon: Clock },
  { id: 'seniority', label: 'Seniority', Icon: Medal },
  { id: 'buildings', label: 'Buildings', Icon: Hammer },
];

export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const by = (CRITERIA.find((c) => c.id === (params.get('by') ?? params.get('par')))?.id ?? 'level') as RankBy;
  const [entries, setEntries] = useState<RankEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get<{ entries: RankEntry[] }>(`features/leaderboard?by=${by}`)
        .then((r) => alive && setEntries(r.entries))
        .catch(() => alive && setEntries([]));
    setEntries(null);
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [by]);

  const value = (e: RankEntry) =>
    ({
      level: t('lvl {level}', { level: e.level }),
      playtime: format.formatDuration(e.playtimeSeconds),
      seniority: format.formatDate(e.firstSeen),
      buildings: `${e.buildings}`,
    })[by];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center gap-3">
        <Trophy className="h-8 w-8 text-yellow-500" />
        <div>
          <h1 className="text-3xl font-bold">{t('Leaderboard')}</h1>
          <p className="text-sm text-slate-500">{t('Updated in real time')}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {CRITERIA.map((c) => (
          <button
            key={c.id}
            onClick={() => setParams({ by: c.id })}
            className={cx(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
              by === c.id ? 'bg-accent text-accent-fg' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800',
            )}
          >
            <c.Icon className="h-4 w-4" /> {t(c.label)}
          </button>
        ))}
      </div>
      <Card className="mt-6">
        {!entries ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <Empty>{t('No ranked player yet.')}</Empty>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="w-12 py-2">
                    {e.rank <= 3 ? (
                      <Crown className={cx('h-5 w-5', e.rank === 1 ? 'text-yellow-500' : e.rank === 2 ? 'text-slate-400' : 'text-amber-700')} />
                    ) : (
                      <span className="font-semibold text-slate-500">{e.rank}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <Link to={`/players/${e.id}`} className="flex items-center gap-2 font-medium hover:text-accent">
                      {e.online && <span className="h-2 w-2 rounded-full bg-green-500" />}
                      {e.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">{value(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// Player profile with statistics

interface Stats {
  days: { day: string; level: number; playtimeSeconds: number }[];
  buildings: number;
}

export function PlayerPage() {
  const { id } = useParams();
  const { boot } = useApp();
  const [p, setP] = useState<PlayerProfile | null | 'missing'>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<PlayerProfile>(`public/players/${id}`).then(setP).catch(() => setP('missing'));
    if (boot.modules['player-stats']) api.get<Stats>(`features/players/${id}/stats`).then(setStats).catch(() => setStats(null));
  }, [id, boot.modules]);

  if (p === null) return <Spinner />;
  if (p === 'missing') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-lg">{t('Player not found.')}</p>
      </div>
    );
  }
  const shortDay = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
  const stat = (label: string, v: ReactNode) => (
    <div className="rounded-xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{v}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{p.name}</h1>
        {p.online ? <Badge tone="green">{t('Online')}</Badge> : <Badge>{t('Seen {when}', { when: format.timeAgo(p.lastSeen) })}</Badge>}
      </div>
      {p.member && <p className="mt-1 text-sm text-slate-500">{t('Site member: {name}', { name: p.member.displayName })}</p>}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stat(t('Level'), p.level)}
        {stat(t('Rank'), p.rank ? `#${p.rank}` : '—')}
        {stat(t('Playtime'), format.formatDuration(p.playtimeSeconds))}
        {stat(t('Buildings'), stats?.buildings ?? '—')}
        {stat(t('Joined on'), <span className="text-base">{format.formatDate(p.firstSeen)}</span>)}
      </div>
      {stats && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card title={t('Level over time')}>
            <LineChart points={stats.days.map((d) => ({ label: shortDay(d.day), value: d.level }))} />
          </Card>
          <Card title={t('Playtime per day')}>
            <BarChart
              points={stats.days.map((d) => ({ label: shortDay(d.day), value: d.playtimeSeconds }))}
              format={(v) => format.formatDuration(v)}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
