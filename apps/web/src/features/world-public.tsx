import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Activity, BookOpen, CalendarDays, Castle, Clock, Crown, Flag, Lightbulb, PartyPopper, Search, Sparkles, Star, Users } from 'lucide-react';
import { api, errorText, url } from '../lib/api';
import { useApp } from '../lib/app';
import * as format from '../lib/format';
import * as ui from '../components/ui';
import { BarChart } from './components';
import { LiveMap, type MapData } from './map/LiveMap';
import { num, t, tm } from '../lib/i18n';

const { Alert, Badge, Button, Card, Empty, Field, Input, Select, Spinner, Textarea, cx } = ui;

function Page({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        {icon}
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** World data refreshes every 30 s on the server while people play: pages follow at the same pace. */
const WORLD_REFRESH_MS = 30_000;

function useGet<T>(path: string | null, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setData(null);
    api
      .get<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorText(e)));
    if (!refreshMs) return () => void (alive = false);
    // Silent refresh, skipped while the tab is hidden.
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      api
        .get<T>(path)
        .then((d) => alive && setData(d))
        .catch(() => {});
    }, refreshMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path, refreshMs]);
  return { data, error };
}

const synced = (ts: number | null) => (ts ? t('World data updated {when}', { when: format.timeAgo(ts) }) : t('World data not available yet'));

// Guilds

interface GuildSummary {
  id: string;
  name: string;
  level: number;
  memberCount: number;
  leader: string | null;
  baseCount: number;
}

export function GuildsPage() {
  const { data, error } = useGet<{ syncedAt: number | null; guilds: GuildSummary[] }>('features/guilds', WORLD_REFRESH_MS);
  return (
    <Page icon={<Castle className="h-8 w-8 text-accent" />} title={t('Guilds')} subtitle={data ? synced(data.syncedAt) : undefined}>
      {error ? (
        <Alert kind="info">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : data.guilds.length === 0 ? (
        <Empty>{t('No guild yet.')}</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.guilds.map((g, i) => (
            <Link key={g.id} to={`/guilds/${g.id}`} className="group">
              <Card className="h-full transition group-hover:ring-accent">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold group-hover:text-accent">{g.name}</p>
                    {g.leader && (
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <Crown className="h-3 w-3 text-yellow-500" /> {g.leader}
                      </p>
                    )}
                  </div>
                  {i < 3 && <Badge tone="accent">#{i + 1}</Badge>}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat label={t('Level')} value={g.level} />
                  <Stat label={t('Members')} value={g.memberCount} />
                  <Stat label={t('Bases')} value={g.baseCount} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

interface GuildDetail {
  id: string;
  name: string;
  level: number;
  members: { name: string; publicId: string | null; level: number | null; pals: number; leader: boolean; lastOnline: string | null }[];
  baseCount: number;
  bases: { x: number; y: number; area: number }[];
  syncedAt: number | null;
}

export function GuildPage() {
  const { id } = useParams();
  const { data, error } = useGet<GuildDetail>(`features/guilds/${id}`);
  const map = useGet<MapData>(data && data.bases.length ? 'features/map' : null);
  if (error) return <Page icon={<Castle className="h-8 w-8 text-accent" />} title={t('Guild')}>{<Alert kind="info">{error}</Alert>}</Page>;
  if (!data) return <Spinner />;
  const layers = { bases: data.bases.map((b) => ({ ...b, guild: data.name, guildId: data.id, level: data.level })) };
  return (
    <Page icon={<Castle className="h-8 w-8 text-accent" />} title={data.name} subtitle={synced(data.syncedAt)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t('Guild level')} value={data.level} />
        <Stat label={t('Members')} value={data.members.length} />
        <Stat label={t('Bases')} value={data.baseCount} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title={<span className="flex items-center gap-2"><Users className="h-4 w-4" /> {t('Members')}</span>}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.members.map((m) => (
              <li key={m.name} className="flex items-center gap-3 py-2 text-sm">
                {m.leader ? <Crown className="h-4 w-4 text-yellow-500" /> : <span className="w-4" />}
                <span className="flex-1 font-medium">
                  {m.publicId ? (
                    <Link to={`/players/${m.publicId}`} className="hover:text-accent">
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}
                </span>
                {m.level !== null && <span className="text-xs text-slate-500">{t('lvl {level}', { level: m.level })}</span>}
                <Badge>{m.pals} Pals</Badge>
              </li>
            ))}
          </ul>
        </Card>
        {data.bases.length > 0 && map.data && (
          <Card title={t('Bases')}>
            <div className="overflow-hidden rounded-lg">
              <LiveMap data={{ ...map.data, pois: [] }} players={[]} layers={layers} height={380} focus={data.bases[0]} />
            </div>
          </Card>
        )}
      </div>
    </Page>
  );
}

// Paldex

/** Pal image (public/pals/<type>.png); a neutral placeholder replaces it when missing. */
export function PalIcon({ type, size = 48 }: { type: string; size?: number }) {
  const [missing, setMissing] = useState(false);
  const file = type.replace(/^boss_/i, '').toLowerCase();
  return missing ? (
    <span className="grid shrink-0 place-items-center rounded-lg bg-slate-100 text-lg dark:bg-slate-800" style={{ width: size, height: size }}>
      🐾
    </span>
  ) : (
    <img
      src={url(`pals/${file}.png`)}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      onError={() => setMissing(true)}
      className="shrink-0 rounded-lg bg-slate-100 object-contain dark:bg-slate-800"
      style={{ width: size, height: size }}
    />
  );
}

interface DexEntry {
  id: string;
  no: string;
  name: string;
  elements: string[];
  count: number;
  owners: number;
  lucky: number;
  alpha: number;
  maxLevel: number;
}

interface DexData {
  syncedAt: number | null;
  scope: { type: 'server' | 'player' | 'guild'; id: string | null; name: string; guild: { id: string; name: string } | null };
  total: number;
  caught: number;
  pals: number;
  lucky: number;
  entries: DexEntry[];
  collectors: { id: string; name: string; species: number; pals: number }[];
  guilds: { id: string; name: string; species: number; pals: number }[];
}

const ELEMENTS: Record<string, { label: string; color: string }> = {
  neutral: { label: 'Neutral', color: '#a8a29e' },
  grass: { label: 'Grass', color: '#22c55e' },
  water: { label: 'Water', color: '#3b82f6' },
  fire: { label: 'Fire', color: '#ef4444' },
  electric: { label: 'Electric', color: '#eab308' },
  dark: { label: 'Dark|element', color: '#7c3aed' },
  ground: { label: 'Ground', color: '#a16207' },
  ice: { label: 'Ice', color: '#38bdf8' },
  dragon: { label: 'Dragon', color: '#c026d3' },
};

const PER_PAGE = 30;

function ElementBadge({ element }: { element: string }) {
  const e = ELEMENTS[element] ?? { label: element, color: '#64748b' };
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: e.color }}>
      {t(e.label)}
    </span>
  );
}

/** Grid cell, like the Palbox: a silhouette until the Pal has been caught. */
function DexCell({ e, selected, onClick }: { e: DexEntry; selected: boolean; onClick: () => void }) {
  const caught = e.count > 0;
  const [missing, setMissing] = useState(false);
  return (
    <button
      onClick={onClick}
      title={caught ? `${e.name} · ×${e.count}` : t('No. {no} · not caught yet', { no: e.no })}
      className={cx(
        'group relative flex aspect-square flex-col items-center justify-center rounded-xl p-1 ring-1 transition',
        caught ? 'bg-slate-50 ring-slate-200 hover:ring-accent dark:bg-slate-800/70 dark:ring-slate-700' : 'bg-slate-100/60 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-800',
        selected && 'ring-2 ring-accent',
      )}
    >
      <span className="absolute top-1 left-1.5 text-[10px] font-bold text-slate-400 tabular-nums">{e.no}</span>
      {e.lucky > 0 && <span className="absolute top-0.5 right-1 text-xs">✨</span>}
      {missing ? (
        <span className="text-2xl opacity-30">🐾</span>
      ) : (
        <img
          src={url(`pals/${e.id}.png`)}
          alt=""
          loading="lazy"
          onError={() => setMissing(true)}
          className={cx('h-3/5 w-3/5 object-contain transition group-hover:scale-110', !caught && 'opacity-25 brightness-0 dark:invert')}
        />
      )}
      <span className={cx('mt-0.5 w-full truncate text-center text-[10px] leading-tight font-medium', !caught && 'text-slate-400')}>{caught ? e.name : '???'}</span>
      {caught && <span className="absolute right-1 bottom-1 rounded bg-accent px-1 text-[10px] font-bold text-accent-fg tabular-nums">{e.count}</span>}
    </button>
  );
}

export function PaldexPage() {
  const [params, setParams] = useSearchParams();
  // "joueur" / "guilde": parameter names used before 1.1.0, still accepted in links.
  const player = params.get('player') ?? params.get('joueur');
  const guild = params.get('guild') ?? params.get('guilde');
  const query = player ? `?player=${encodeURIComponent(player)}` : guild ? `?guild=${encodeURIComponent(guild)}` : '';
  const { data, error } = useGet<DexData>(`features/paldex${query}`, WORLD_REFRESH_MS);
  const [q, setQ] = useState('');
  const [onlyCaught, setOnlyCaught] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const page = Math.max(1, Number(params.get('page')) || 1);

  const list = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.entries.filter((e) => (!onlyCaught || e.count > 0) && (!term || e.name.toLowerCase().includes(term) || e.no.toLowerCase().includes(term)));
  }, [data, q, onlyCaught]);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const current = Math.min(page, pages);
  const shown = list.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const detail = data?.entries.find((e) => e.id === selected) ?? null;

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { player, guild, page: null as string | null, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    setParams(p);
    setSelected(null);
  };

  const title =
    !data || data.scope.type === 'server'
      ? t('Server Paldex')
      : data.scope.type === 'player'
        ? t("{name}'s Paldex", { name: data.scope.name })
        : t('Paldex of the guild {name}', { name: data.scope.name });

  return (
    <Page icon={<BookOpen className="h-8 w-8 text-accent" />} title={title} subtitle={data ? synced(data.syncedAt) : undefined}>
      {error ? (
        <Alert kind="info">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            {data.scope.type !== 'server' && (
              <div className="mb-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => go({ player: null, guild: null })}>
                  ← {t('Server Paldex')}
                </Button>
                {data.scope.guild && (
                  <Button variant="secondary" onClick={() => go({ player: null, guild: data.scope.guild!.id })}>
                    <Castle className="h-4 w-4" /> {t('Their guild Paldex ({name})', { name: data.scope.guild.name })}
                  </Button>
                )}
                {data.scope.type === 'player' && data.scope.id && (
                  <Link to={`/players/${data.scope.id}`}>
                    <Button variant="ghost">{t('Player profile')}</Button>
                  </Link>
                )}
              </div>
            )}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                <p className="text-[11px] text-slate-500">{t('Species caught')}</p>
                <p className="text-lg font-bold">
                  {data.caught} <span className="text-sm font-medium text-slate-500">/ {data.total}</span>
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(data.caught / data.total) * 100}%` }} />
                </div>
              </div>
              <Stat label={t('Pals caught')} value={data.pals} />
              <Stat label={`${t('Lucky')} ✨`} value={data.lucky} />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="relative min-w-48 flex-1">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <Input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    go({ page: null });
                  }}
                  placeholder={t('Name or number…')}
                  className="pl-9"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyCaught}
                  onChange={(e) => {
                    setOnlyCaught(e.target.checked);
                    go({ page: null });
                  }}
                  className="accent-[var(--accent)]"
                />
                {t('Caught only')}
              </label>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">
              {shown.length === 0 ? (
                <Empty>{t('No Pal.')}</Empty>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {shown.map((e) => (
                    <DexCell key={e.id} e={e} selected={selected === e.id} onClick={() => setSelected(selected === e.id ? null : e.id)} />
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button variant="ghost" disabled={current <= 1} onClick={() => go({ page: String(current - 1) })}>
                  ‹ {t('Previous')}
                </Button>
                <div className="flex flex-wrap justify-center gap-1">
                  {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => go({ page: n === 1 ? null : String(n) })}
                      className={cx('h-7 min-w-7 rounded-md px-1 text-xs font-semibold tabular-nums', n === current ? 'bg-accent text-accent-fg' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" disabled={current >= pages} onClick={() => go({ page: String(current + 1) })}>
                  {t('Next')} ›
                </Button>
              </div>
            </div>

            {detail && (
              <Card className="mt-4">
                <div className="flex flex-wrap items-center gap-4">
                  <PalIcon type={detail.id} size={80} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-500">{t('No. {no}', { no: detail.no })}</p>
                    <p className="text-xl font-bold">{detail.count > 0 ? detail.name : '???'}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {detail.elements.map((el) => (
                        <ElementBadge key={el} element={el} />
                      ))}
                    </div>
                  </div>
                  {detail.count > 0 ? (
                    <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
                      <Stat label={t('Caught')} value={detail.count} />
                      <Stat label={data.scope.type === 'player' ? t('Max level') : t('Tamers')} value={data.scope.type === 'player' ? detail.maxLevel : detail.owners} />
                      <Stat label={t('Lucky')} value={detail.lucky} />
                      <Stat label={t('Alphas')} value={detail.alpha} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">{data.scope.type === 'server' ? t('Not caught on the server yet.') : t('Not caught yet.')}</p>
                  )}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card title={<span className="flex items-center gap-2"><Star className="h-4 w-4 text-yellow-500" /> {t('Collectors')}</span>}>
              {data.collectors.length === 0 ? (
                <Empty>{t('Nobody yet.')}</Empty>
              ) : (
                <ol className="space-y-0.5">
                  {data.collectors.map((c, i) => (
                    <li key={c.id}>
                      <button
                        onClick={() => go({ player: c.id, guild: null })}
                        className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800', player === c.id && 'bg-accent/10 text-accent')}
                      >
                        <span className="w-5 text-right font-semibold text-slate-500">{i + 1}</span>
                        <span className="flex-1 truncate font-medium">{c.name}</span>
                        <span className="text-xs tabular-nums text-slate-500" title={`${c.pals} Pals`}>
                          {t('{n} sp.', { n: c.species })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            {data.guilds.length > 0 && (
              <Card title={<span className="flex items-center gap-2"><Castle className="h-4 w-4" /> {t('Guilds')}</span>}>
                <ol className="space-y-0.5">
                  {data.guilds.map((g, i) => (
                    <li key={g.id}>
                      <button
                        onClick={() => go({ guild: g.id, player: null })}
                        className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800', guild === g.id && 'bg-accent/10 text-accent')}
                      >
                        <span className="w-5 text-right font-semibold text-slate-500">{i + 1}</span>
                        <span className="flex-1 truncate font-medium">{g.name}</span>
                        <span className="text-xs tabular-nums text-slate-500">{t('{n} sp.', { n: g.species })}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}


// Events

interface PublicEvent {
  id: number;
  name: string;
  description: string;
  startsAt: number;
  endsAt: number;
  status: 'scheduled' | 'active' | 'done';
  changes: string[];
}

/** "2 d 4 h", "3 h 12 min", "45 s" */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return t('{d} d {h} h', { d, h });
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${s} s`;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function EventCard({ e, now }: { e: PublicEvent; now: number }) {
  const active = e.status === 'active' || (e.startsAt <= now && e.endsAt > now);
  return (
    <Card className={cx(active && 'ring-2 ring-accent')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold">{e.name}</p>
          <p className="text-sm text-slate-500">
            {format.formatDateTime(e.startsAt)} → {format.formatDateTime(e.endsAt)}
          </p>
        </div>
        {active ? (
          <Badge tone="green">{t('Running · {time} left', { time: countdown(e.endsAt - now) })}</Badge>
        ) : e.status === 'done' ? (
          <Badge>{t('Over')}</Badge>
        ) : (
          <Badge tone="accent">{t('In {time}', { time: countdown(e.startsAt - now) })}</Badge>
        )}
      </div>
      {e.description && <p className="mt-3 text-sm">{e.description}</p>}
      {e.changes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {e.changes.map((c) => (
            <li key={c}>
              <Badge tone="blue">{tm(c)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function CalendarPage() {
  const { data, error } = useGet<{ upcoming: PublicEvent[]; past: PublicEvent[] }>('features/calendar');
  const now = useNow();
  return (
    <Page icon={<CalendarDays className="h-8 w-8 text-accent" />} title={t('Events')} subtitle={t('Server settings change during events (XP, captures, loot…).')}>
      {error ? (
        <Alert kind="info">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {data.upcoming.length === 0 ? <Empty>{t('No event planned right now. Check back soon!')}</Empty> : data.upcoming.map((e) => <EventCard key={e.id} e={e} now={now} />)}
          {data.past.length > 0 && (
            <>
              <h2 className="pt-6 text-lg font-semibold text-slate-500">{t('Recent events')}</h2>
              {data.past.map((e) => (
                <EventCard key={e.id} e={e} now={now} />
              ))}
            </>
          )}
        </div>
      )}
    </Page>
  );
}

/** Home page banner: current or next event, with a countdown. */
export function EventBanner() {
  const { data } = useGet<{ upcoming: PublicEvent[] }>('features/calendar');
  const now = useNow();
  const e = data?.upcoming.find((x) => x.endsAt > now);
  if (!e) return null;
  const active = e.startsAt <= now;
  return (
    <Link
      to="/events"
      className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-accent/20 to-transparent p-4 ring-1 ring-accent/40 transition hover:ring-accent"
    >
      <PartyPopper className="h-6 w-6 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{active ? t('Event running: {name}', { name: e.name }) : t('Next event: {name}', { name: e.name })}</p>
        {e.changes.length > 0 && <p className="truncate text-sm text-slate-500">{e.changes.map(tm).join(' · ')}</p>}
      </div>
      <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-accent-fg tabular-nums">
        {active ? t('Ends in {time}', { time: countdown(e.endsAt - now) }) : t('In {time}', { time: countdown(e.startsAt - now) })}
      </span>
    </Link>
  );
}

// Uptime

interface UptimeData {
  status: { online: boolean; players: number; maxPlayers: number };
  uptimePercent: number | null;
  days: { day: string; percent: number | null }[];
  hourly: number[];
  nextRestart: number | null;
}

export function UptimePage() {
  const { data, error } = useGet<UptimeData>('features/uptime');
  const tone = (p: number | null) => (p === null ? 'bg-slate-300 dark:bg-slate-700' : p >= 99 ? 'bg-green-500' : p >= 90 ? 'bg-amber-400' : 'bg-red-500');
  return (
    <Page icon={<Activity className="h-8 w-8 text-accent" />} title={t('Uptime')} subtitle={t('Server status over the last 30 days.')}>
      {error ? (
        <Alert kind="info">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-slate-500">{t('Now')}</p>
              <p className={cx('mt-1 text-2xl font-bold', data.status.online ? 'text-green-500' : 'text-red-500')}>{data.status.online ? t('Online') : t('Offline')}</p>
              {data.status.online && (
                <p className="text-sm text-slate-500">
                  {t('{n} / {max} players', { n: data.status.players, max: data.status.maxPlayers })}
                </p>
              )}
            </Card>
            <Card>
              <p className="text-xs text-slate-500">{t('Uptime (30 days)')}</p>
              <p className="mt-1 text-2xl font-bold">{data.uptimePercent === null ? '—' : `${data.uptimePercent} %`}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">{t('Next restart')}</p>
              <p className="mt-1 text-2xl font-bold">{data.nextRestart ? format.formatDateTime(data.nextRestart) : t('None planned')}</p>
            </Card>
          </div>
          <Card title={t('Day by day')}>
            {data.days.length === 0 ? (
              <Empty>{t('No data yet.')}</Empty>
            ) : (
              <div className="flex h-12 items-end gap-1">
                {data.days.map((d) => (
                  <div key={d.day} title={`${format.formatDate(new Date(d.day).getTime())}: ${d.percent ?? '—'} %`} className={cx('h-full flex-1 rounded-sm', tone(d.percent))} />
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500" /> ≥ 99 %</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" /> ≥ 90 %</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" /> {t('less')}</span>
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Clock className="h-4 w-4" /> {t('Average attendance per hour')}</span>}>
            <BarChart points={data.hourly.map((v, h) => ({ label: `${h} h`, value: v }))} format={(v) => t('{n} players', { n: v })} />
          </Card>
        </div>
      )}
    </Page>
  );
}

// Reports and suggestions

interface MyTicket {
  id: number;
  kind: 'report' | 'suggestion';
  subject: string;
  message: string;
  status: 'open' | 'answered' | 'closed';
  reply: string | null;
  repliedBy: string | null;
  createdAt: number;
}

const TICKET_STATUS: Record<MyTicket['status'], { label: string; tone: 'amber' | 'green' | 'slate' }> = {
  open: { label: 'Waiting', tone: 'amber' },
  answered: { label: 'Answered', tone: 'green' },
  closed: { label: 'Closed', tone: 'slate' },
};

export function TicketsPage() {
  const { boot } = useApp();
  const [form, setForm] = useState({ kind: 'report' as 'report' | 'suggestion', subject: '', target: '', message: '' });
  const [mine, setMine] = useState<MyTicket[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    api
      .get<MyTicket[]>('features/me/tickets')
      .then(setMine)
      .catch(() => setMine([]));
  };
  useEffect(() => {
    if (boot.user) load();
  }, [boot.user]);

  if (!boot.user) {
    return (
      <Page icon={<Flag className="h-8 w-8 text-accent" />} title={t('Report or suggest')}>
        <Alert kind="info">
          <Link to="/login" className="font-semibold underline">
            {t('Log in')}
          </Link>{' '}
          {t('to report a problem or suggest an idea to the team.')}
        </Alert>
      </Page>
    );
  }

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.post('features/tickets', { ...form, target: form.target || undefined });
      setForm({ ...form, subject: '', target: '', message: '' });
      setMsg({ kind: 'success', text: t('Thanks! The team got your message.') });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page icon={<Flag className="h-8 w-8 text-accent" />} title={t('Report or suggest')} subtitle={t('A problem in game, a cheater, an idea for the server? Write to the team.')}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['report', 'Report', Flag],
                  ['suggestion', 'Suggest', Lightbulb],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => setForm({ ...form, kind: k })}
                  className={cx(
                    'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1',
                    form.kind === k ? 'bg-accent text-accent-fg ring-accent' : 'ring-slate-200 dark:ring-slate-800',
                  )}
                >
                  <Icon className="h-4 w-4" /> {t(label)}
                </button>
              ))}
            </div>
            <Field label={t('Subject')}>{(id) => <Input id={id} value={form.subject} maxLength={120} onChange={(e) => setForm({ ...form, subject: e.target.value })} />}</Field>
            {form.kind === 'report' && (
              <Field label={t('Player involved (optional)')}>
                {(id) => <Input id={id} value={form.target} maxLength={64} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder={t('In-game name')} />}
              </Field>
            )}
            <Field label={t('Message')} help={t('Give as many details as you can: where, when, what happened.')}>
              {(id) => <Textarea id={id} rows={6} value={form.message} maxLength={3000} onChange={(e) => setForm({ ...form, message: e.target.value })} />}
            </Field>
            {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
            <Button loading={busy} onClick={() => void submit()} disabled={form.subject.length < 3 || form.message.length < 10}>
              {t('Send')}
            </Button>
          </div>
        </Card>
        <Card title={t('My requests')}>
          {!mine ? (
            <Spinner />
          ) : mine.length === 0 ? (
            <Empty>{t('No request sent.')}</Empty>
          ) : (
            <ul className="space-y-3">
              {mine.map((tk) => (
                <li key={tk.id} className="rounded-lg p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {tk.kind === 'report' ? '🚩' : '💡'} {tk.subject}
                    </p>
                    <Badge tone={TICKET_STATUS[tk.status].tone}>{t(TICKET_STATUS[tk.status].label)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{format.formatDateTime(tk.createdAt)}</p>
                  {tk.reply && (
                    <div className="mt-2 rounded-lg bg-accent/10 p-2 text-sm">
                      <p className="text-xs font-semibold text-accent">{t('Answer from {name}', { name: tk.repliedBy })}</p>
                      <p className="whitespace-pre-line">{tk.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}

// My character (profile)

export interface PalView {
  type: string;
  name: string;
  nickname: string;
  level: number;
  gender: string;
  lucky: boolean;
  boss: boolean;
  rank: number;
  talents: { hp: number; attack: number; defense: number };
  passives: { id: string; name: string }[];
}
export interface InventoryGroup {
  key: string;
  label: string;
  items: { id: string; name: string; count: number; slot: number }[];
}

const STAT_NAMES: Record<string, string> = {
  最大HP: 'Health',
  最大SP: 'Stamina',
  攻撃力: 'Attack',
  所持重量: 'Weight',
  捕獲率: 'Capture',
  作業速度: 'Work',
};
export const statName = (k: string) => (STAT_NAMES[k] ? t(STAT_NAMES[k]) : k);

export function PalTable({ pals }: { pals: PalView[] }) {
  const [all, setAll] = useState(false);
  if (pals.length === 0) return <Empty>{t('No Pal.')}</Empty>;
  const shown = all ? pals : pals.slice(0, 12);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">Pal</th>
              <th className="py-1">{t('Lvl')}</th>
              <th className="py-1">{t('Talents (HP / atk / def)')}</th>
              <th className="py-1">{t('Passives')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">
                  <span className="font-medium">{p.nickname || p.name}</span>
                  {p.nickname && <span className="text-xs text-slate-500"> ({p.name})</span>}
                  {p.lucky && <span title={t('Lucky')}> ✨</span>}
                  {p.boss && <Badge tone="red">alpha</Badge>}
                  {p.rank > 1 && <span className="ml-1 text-xs text-amber-500">{'★'.repeat(Math.min(4, p.rank - 1))}</span>}
                </td>
                <td className="py-1.5 tabular-nums">{p.level}</td>
                <td className="py-1.5 text-xs tabular-nums text-slate-500">
                  {p.talents.hp} / {p.talents.attack} / {p.talents.defense}
                </td>
                <td className="py-1.5 text-xs">{p.passives.map((s) => s.name).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pals.length > 12 && (
        <button className="mt-2 text-sm font-medium text-accent" onClick={() => setAll(!all)}>
          {all ? t('Show less') : t('See all {n} Pals', { n: pals.length })}
        </button>
      )}
    </>
  );
}

export function InventoryView({ inventory }: { inventory: InventoryGroup[] }) {
  if (inventory.length === 0) return <Empty>{t('Empty inventory.')}</Empty>;
  return (
    <div className="space-y-4">
      {inventory.map((c) => (
        <div key={c.key}>
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t(c.label)}</p>
          <div className="flex flex-wrap gap-1.5">
            {c.items.map((i) => (
              <span key={`${i.slot}-${i.id}`} className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                {i.name}
                {i.count > 1 && <span className="ml-1 font-semibold tabular-nums">×{num(i.count)}</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Character {
  linked: boolean;
  publicId?: string;
  name?: string;
  syncedAt?: number | null;
  world?: {
    level: number;
    statusPoints: Record<string, number>;
    inventory: InventoryGroup[];
    pals: PalView[];
    guild: { id: string; name: string; level: number } | null;
    bases: { x: number; y: number }[];
  } | null;
}

export function CharacterSection() {
  const { boot } = useApp();
  const [c, setC] = useState<Character | null>(null);
  const [tab, setTab] = useState<'pals' | 'inventory'>('pals');
  useEffect(() => {
    if (!boot.modules.character) return;
    let alive = true;
    const load = () => api.get<Character>('features/me/character').then((d) => alive && setC(d));
    load().catch(() => alive && setC(null));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load().catch(() => {});
    }, WORLD_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [boot.modules.character]);
  if (!c || !c.linked) return null;
  if (!c.world) {
    return (
      <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> {t('My Pals and inventory')}</span>}>
        <p className="text-sm text-slate-500">{t('Your character will show up here after the next read of the world save.')}</p>
      </Card>
    );
  }
  const w = c.world;
  return (
    <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> {t('My Pals and inventory')}</span>} actions={<span className="text-xs text-slate-500">{c.syncedAt ? t('updated {when}', { when: format.timeAgo(c.syncedAt) }) : ''}</span>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('Level')} value={w.level} />
        <Stat label={t('Pals')} value={w.pals.length} />
        <Stat label={t('Lucky')} value={w.pals.filter((p) => p.lucky).length} />
        <Stat
          label={t('Guild')}
          value={
            w.guild ? (
              <Link to={`/guilds/${w.guild.id}`} className="text-base text-accent">
                {w.guild.name}
              </Link>
            ) : (
              '—'
            )
          }
        />
      </div>
      {Object.keys(w.statusPoints).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(w.statusPoints).map(([k, v]) => (
            <Badge key={k}>
              {statName(k)} +{v}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-5 flex gap-2">
        {(
          [
            ['pals', 'My Pals'],
            ['inventory', 'Inventory'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg px-3 py-1.5 text-sm font-medium', tab === k ? 'bg-accent text-accent-fg' : 'ring-1 ring-slate-200 dark:ring-slate-800')}>
            {t(label)}
          </button>
        ))}
      </div>
      <div className="mt-4">{tab === 'pals' ? <PalTable pals={w.pals} /> : <InventoryView inventory={w.inventory} />}</div>
    </Card>
  );
}
