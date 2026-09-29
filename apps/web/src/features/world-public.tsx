import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Activity, BookOpen, CalendarDays, Castle, Clock, Crown, Flag, Lightbulb, PartyPopper, Search, Sparkles, Star, Users } from 'lucide-react';
import { api, errorText, url } from '../lib/api';
import { useApp } from '../lib/app';
import * as format from '../lib/format';
import * as ui from '../components/ui';
import { BarChart } from './components';
import { LiveMap, type MapData } from './map/LiveMap';

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

function useGet<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    setData(null);
    api
      .get<T>(path)
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, [path]);
  return { data, error };
}

const synced = (ts: number | null) => (ts ? `Données du monde mises à jour ${format.timeAgo(ts)}` : 'Données du monde pas encore disponibles');

// Guildes

interface GuildSummary {
  id: string;
  name: string;
  level: number;
  memberCount: number;
  leader: string | null;
  baseCount: number;
}

export function GuildsPage() {
  const { data, error } = useGet<{ syncedAt: number | null; guilds: GuildSummary[] }>('features/guilds');
  return (
    <Page icon={<Castle className="h-8 w-8 text-accent" />} title="Guildes" subtitle={data ? synced(data.syncedAt) : undefined}>
      {error ? (
        <Alert kind="info">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : data.guilds.length === 0 ? (
        <Empty>Aucune guilde pour le moment.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.guilds.map((g, i) => (
            <Link key={g.id} to={`/guildes/${g.id}`} className="group">
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
                  <Stat label="Niveau" value={g.level} />
                  <Stat label="Membres" value={g.memberCount} />
                  <Stat label="Bases" value={g.baseCount} />
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
  if (error) return <Page icon={<Castle className="h-8 w-8 text-accent" />} title="Guilde">{<Alert kind="info">{error}</Alert>}</Page>;
  if (!data) return <Spinner />;
  const layers = { bases: data.bases.map((b) => ({ ...b, guild: data.name, guildId: data.id, level: data.level })) };
  return (
    <Page icon={<Castle className="h-8 w-8 text-accent" />} title={data.name} subtitle={synced(data.syncedAt)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Niveau de la guilde" value={data.level} />
        <Stat label="Membres" value={data.members.length} />
        <Stat label="Bases" value={data.baseCount} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title={<span className="flex items-center gap-2"><Users className="h-4 w-4" /> Membres</span>}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.members.map((m) => (
              <li key={m.name} className="flex items-center gap-3 py-2 text-sm">
                {m.leader ? <Crown className="h-4 w-4 text-yellow-500" /> : <span className="w-4" />}
                <span className="flex-1 font-medium">
                  {m.publicId ? (
                    <Link to={`/joueurs/${m.publicId}`} className="hover:text-accent">
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}
                </span>
                {m.level !== null && <span className="text-xs text-slate-500">niv. {m.level}</span>}
                <Badge>{m.pals} Pals</Badge>
              </li>
            ))}
          </ul>
        </Card>
        {data.bases.length > 0 && map.data && (
          <Card title="Bases">
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

/** Image du Pal (public/pals/<type>.png) ; si elle manque, un emplacement neutre la remplace. */
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
  neutral: { label: 'Neutre', color: '#a8a29e' },
  grass: { label: 'Plante', color: '#22c55e' },
  water: { label: 'Eau', color: '#3b82f6' },
  fire: { label: 'Feu', color: '#ef4444' },
  electric: { label: 'Électrique', color: '#eab308' },
  dark: { label: 'Ténèbres', color: '#7c3aed' },
  ground: { label: 'Terre', color: '#a16207' },
  ice: { label: 'Glace', color: '#38bdf8' },
  dragon: { label: 'Dragon', color: '#c026d3' },
};

const PER_PAGE = 30;

function ElementBadge({ element }: { element: string }) {
  const e = ELEMENTS[element] ?? { label: element, color: '#64748b' };
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: e.color }}>
      {e.label}
    </span>
  );
}

/** Case de la grille, façon boîte à Pals : silhouette tant que le Pal n'a pas été capturé. */
function DexCell({ e, selected, onClick }: { e: DexEntry; selected: boolean; onClick: () => void }) {
  const caught = e.count > 0;
  const [missing, setMissing] = useState(false);
  return (
    <button
      onClick={onClick}
      title={caught ? `${e.name} · ×${e.count}` : `n° ${e.no} · pas encore capturé`}
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
  const joueur = params.get('joueur');
  const guilde = params.get('guilde');
  const query = joueur ? `?joueur=${encodeURIComponent(joueur)}` : guilde ? `?guilde=${encodeURIComponent(guilde)}` : '';
  const { data, error } = useGet<DexData>(`features/paldex${query}`);
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
    const merged = { joueur, guilde, page: null as string | null, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    setParams(p);
    setSelected(null);
  };

  const title = !data || data.scope.type === 'server' ? 'Paldex du serveur' : data.scope.type === 'player' ? `Paldex de ${data.scope.name}` : `Paldex de la guilde ${data.scope.name}`;

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
                <Button variant="secondary" onClick={() => go({ joueur: null, guilde: null })}>
                  ← Paldex du serveur
                </Button>
                {data.scope.guild && (
                  <Button variant="secondary" onClick={() => go({ joueur: null, guilde: data.scope.guild!.id })}>
                    <Castle className="h-4 w-4" /> Paldex de sa guilde ({data.scope.guild.name})
                  </Button>
                )}
                {data.scope.type === 'player' && data.scope.id && (
                  <Link to={`/joueurs/${data.scope.id}`}>
                    <Button variant="ghost">Profil du joueur</Button>
                  </Link>
                )}
              </div>
            )}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                <p className="text-[11px] text-slate-500">Espèces capturées</p>
                <p className="text-lg font-bold">
                  {data.caught} <span className="text-sm font-medium text-slate-500">/ {data.total}</span>
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(data.caught / data.total) * 100}%` }} />
                </div>
              </div>
              <Stat label="Pals capturés" value={data.pals} />
              <Stat label="Chanceux ✨" value={data.lucky} />
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
                  placeholder="Nom ou numéro…"
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
                Capturés seulement
              </label>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">
              {shown.length === 0 ? (
                <Empty>Aucun Pal.</Empty>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {shown.map((e) => (
                    <DexCell key={e.id} e={e} selected={selected === e.id} onClick={() => setSelected(selected === e.id ? null : e.id)} />
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button variant="ghost" disabled={current <= 1} onClick={() => go({ page: String(current - 1) })}>
                  ‹ Précédente
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
                  Suivante ›
                </Button>
              </div>
            </div>

            {detail && (
              <Card className="mt-4">
                <div className="flex flex-wrap items-center gap-4">
                  <PalIcon type={detail.id} size={80} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-500">n° {detail.no}</p>
                    <p className="text-xl font-bold">{detail.count > 0 ? detail.name : '???'}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {detail.elements.map((el) => (
                        <ElementBadge key={el} element={el} />
                      ))}
                    </div>
                  </div>
                  {detail.count > 0 ? (
                    <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
                      <Stat label="Capturés" value={detail.count} />
                      <Stat label={data.scope.type === 'player' ? 'Niveau max' : 'Dresseurs'} value={data.scope.type === 'player' ? detail.maxLevel : detail.owners} />
                      <Stat label="Chanceux" value={detail.lucky} />
                      <Stat label="Alphas" value={detail.alpha} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Pas encore capturé{data.scope.type === 'server' ? ' sur le serveur' : ''}.</p>
                  )}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card title={<span className="flex items-center gap-2"><Star className="h-4 w-4 text-yellow-500" /> Collectionneurs</span>}>
              {data.collectors.length === 0 ? (
                <Empty>Personne pour l’instant.</Empty>
              ) : (
                <ol className="space-y-0.5">
                  {data.collectors.map((c, i) => (
                    <li key={c.id}>
                      <button
                        onClick={() => go({ joueur: c.id, guilde: null })}
                        className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800', joueur === c.id && 'bg-accent/10 text-accent')}
                      >
                        <span className="w-5 text-right font-semibold text-slate-500">{i + 1}</span>
                        <span className="flex-1 truncate font-medium">{c.name}</span>
                        <span className="text-xs tabular-nums text-slate-500" title={`${c.pals} Pals`}>
                          {c.species} esp.
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            {data.guilds.length > 0 && (
              <Card title={<span className="flex items-center gap-2"><Castle className="h-4 w-4" /> Guildes</span>}>
                <ol className="space-y-0.5">
                  {data.guilds.map((g, i) => (
                    <li key={g.id}>
                      <button
                        onClick={() => go({ guilde: g.id, joueur: null })}
                        className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800', guilde === g.id && 'bg-accent/10 text-accent')}
                      >
                        <span className="w-5 text-right font-semibold text-slate-500">{i + 1}</span>
                        <span className="flex-1 truncate font-medium">{g.name}</span>
                        <span className="text-xs tabular-nums text-slate-500">{g.species} esp.</span>
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


// Événements

interface PublicEvent {
  id: number;
  name: string;
  description: string;
  startsAt: number;
  endsAt: number;
  status: 'scheduled' | 'active' | 'done';
  changes: string[];
}

/** "2 j 4 h", "3 h 12 min", "45 s" */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} j ${h} h`;
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
          <Badge tone="green">En cours · encore {countdown(e.endsAt - now)}</Badge>
        ) : e.status === 'done' ? (
          <Badge>Terminé</Badge>
        ) : (
          <Badge tone="accent">Dans {countdown(e.startsAt - now)}</Badge>
        )}
      </div>
      {e.description && <p className="mt-3 text-sm">{e.description}</p>}
      {e.changes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {e.changes.map((c) => (
            <li key={c}>
              <Badge tone="blue">{c}</Badge>
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
    <Page icon={<CalendarDays className="h-8 w-8 text-accent" />} title="Événements" subtitle="Les réglages du serveur changent pendant les événements (XP, captures, butin…).">
      {error ? (
        <Alert kind="info">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {data.upcoming.length === 0 ? <Empty>Aucun événement prévu pour le moment. Reviens bientôt !</Empty> : data.upcoming.map((e) => <EventCard key={e.id} e={e} now={now} />)}
          {data.past.length > 0 && (
            <>
              <h2 className="pt-6 text-lg font-semibold text-slate-500">Derniers événements</h2>
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

/** Bandeau de l'accueil : événement en cours ou prochain événement, avec compte à rebours. */
export function EventBanner() {
  const { data } = useGet<{ upcoming: PublicEvent[] }>('features/calendar');
  const now = useNow();
  const e = data?.upcoming.find((x) => x.endsAt > now);
  if (!e) return null;
  const active = e.startsAt <= now;
  return (
    <Link
      to="/evenements"
      className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-accent/20 to-transparent p-4 ring-1 ring-accent/40 transition hover:ring-accent"
    >
      <PartyPopper className="h-6 w-6 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{active ? `Événement en cours : ${e.name}` : `Prochain événement : ${e.name}`}</p>
        {e.changes.length > 0 && <p className="truncate text-sm text-slate-500">{e.changes.join(' · ')}</p>}
      </div>
      <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-accent-fg tabular-nums">
        {active ? `Fin dans ${countdown(e.endsAt - now)}` : `Dans ${countdown(e.startsAt - now)}`}
      </span>
    </Link>
  );
}

// Disponibilité

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
    <Page icon={<Activity className="h-8 w-8 text-accent" />} title="Disponibilité" subtitle="État du serveur sur les 30 derniers jours.">
      {error ? (
        <Alert kind="info">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-slate-500">Maintenant</p>
              <p className={cx('mt-1 text-2xl font-bold', data.status.online ? 'text-green-500' : 'text-red-500')}>{data.status.online ? 'En ligne' : 'Hors ligne'}</p>
              {data.status.online && (
                <p className="text-sm text-slate-500">
                  {data.status.players} / {data.status.maxPlayers} joueurs
                </p>
              )}
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Disponibilité (30 jours)</p>
              <p className="mt-1 text-2xl font-bold">{data.uptimePercent === null ? '—' : `${data.uptimePercent} %`}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Prochain redémarrage</p>
              <p className="mt-1 text-2xl font-bold">{data.nextRestart ? format.formatDateTime(data.nextRestart) : 'Aucun prévu'}</p>
            </Card>
          </div>
          <Card title="Jour par jour">
            {data.days.length === 0 ? (
              <Empty>Pas encore de données.</Empty>
            ) : (
              <div className="flex h-12 items-end gap-1">
                {data.days.map((d) => (
                  <div key={d.day} title={`${format.formatDate(new Date(d.day).getTime())} : ${d.percent ?? '—'} %`} className={cx('h-full flex-1 rounded-sm', tone(d.percent))} />
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500" /> ≥ 99 %</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" /> ≥ 90 %</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" /> moins</span>
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Fréquentation moyenne par heure</span>}>
            <BarChart points={data.hourly.map((v, h) => ({ label: `${h} h`, value: v }))} format={(v) => `${v} joueurs`} />
          </Card>
        </div>
      )}
    </Page>
  );
}

// Signalements et suggestions

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
  open: { label: 'En attente', tone: 'amber' },
  answered: { label: 'Réponse reçue', tone: 'green' },
  closed: { label: 'Fermée', tone: 'slate' },
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
      <Page icon={<Flag className="h-8 w-8 text-accent" />} title="Signaler ou suggérer">
        <Alert kind="info">
          <Link to="/connexion" className="font-semibold underline">
            Connecte-toi
          </Link>{' '}
          pour signaler un problème ou proposer une idée à l’équipe.
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
      setMsg({ kind: 'success', text: 'Merci ! L’équipe a bien reçu ton message.' });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page icon={<Flag className="h-8 w-8 text-accent" />} title="Signaler ou suggérer" subtitle="Un problème en jeu, un tricheur, une idée pour le serveur ? Écris à l’équipe.">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['report', 'Signaler', Flag],
                  ['suggestion', 'Suggérer', Lightbulb],
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
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            <Field label="Sujet">{(id) => <Input id={id} value={form.subject} maxLength={120} onChange={(e) => setForm({ ...form, subject: e.target.value })} />}</Field>
            {form.kind === 'report' && (
              <Field label="Joueur concerné (facultatif)">
                {(id) => <Input id={id} value={form.target} maxLength={64} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="Pseudo en jeu" />}
              </Field>
            )}
            <Field label="Message" help="Donne un maximum de détails : où, quand, ce qui s’est passé.">
              {(id) => <Textarea id={id} rows={6} value={form.message} maxLength={3000} onChange={(e) => setForm({ ...form, message: e.target.value })} />}
            </Field>
            {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
            <Button loading={busy} onClick={() => void submit()} disabled={form.subject.length < 3 || form.message.length < 10}>
              Envoyer
            </Button>
          </div>
        </Card>
        <Card title="Mes demandes">
          {!mine ? (
            <Spinner />
          ) : mine.length === 0 ? (
            <Empty>Aucune demande envoyée.</Empty>
          ) : (
            <ul className="space-y-3">
              {mine.map((t) => (
                <li key={t.id} className="rounded-lg p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {t.kind === 'report' ? '🚩' : '💡'} {t.subject}
                    </p>
                    <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{format.formatDateTime(t.createdAt)}</p>
                  {t.reply && (
                    <div className="mt-2 rounded-lg bg-accent/10 p-2 text-sm">
                      <p className="text-xs font-semibold text-accent">Réponse de {t.repliedBy}</p>
                      <p className="whitespace-pre-line">{t.reply}</p>
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

// Mon personnage (profil)

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
  最大HP: 'Vie',
  最大SP: 'Endurance',
  攻撃力: 'Attaque',
  所持重量: 'Poids',
  捕獲率: 'Capture',
  作業速度: 'Travail',
};
export const statName = (k: string) => STAT_NAMES[k] ?? k;

export function PalTable({ pals }: { pals: PalView[] }) {
  const [all, setAll] = useState(false);
  if (pals.length === 0) return <Empty>Aucun Pal.</Empty>;
  const shown = all ? pals : pals.slice(0, 12);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">Pal</th>
              <th className="py-1">Niv.</th>
              <th className="py-1">Talents (vie / att. / déf.)</th>
              <th className="py-1">Passifs</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">
                  <span className="font-medium">{p.nickname || p.name}</span>
                  {p.nickname && <span className="text-xs text-slate-500"> ({p.name})</span>}
                  {p.lucky && <span title="Chanceux"> ✨</span>}
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
          {all ? 'Réduire' : `Voir les ${pals.length} Pals`}
        </button>
      )}
    </>
  );
}

export function InventoryView({ inventory }: { inventory: InventoryGroup[] }) {
  if (inventory.length === 0) return <Empty>Inventaire vide.</Empty>;
  return (
    <div className="space-y-4">
      {inventory.map((c) => (
        <div key={c.key}>
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{c.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {c.items.map((i) => (
              <span key={`${i.slot}-${i.id}`} className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                {i.name}
                {i.count > 1 && <span className="ml-1 font-semibold tabular-nums">×{i.count.toLocaleString('fr-FR')}</span>}
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
    if (boot.modules.character) api.get<Character>('features/me/character').then(setC).catch(() => setC(null));
  }, [boot.modules.character]);
  if (!c || !c.linked) return null;
  if (!c.world) {
    return (
      <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Mes Pals et mon inventaire</span>}>
        <p className="text-sm text-slate-500">Ton personnage apparaîtra ici après la prochaine lecture de la sauvegarde du monde.</p>
      </Card>
    );
  }
  const w = c.world;
  return (
    <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Mes Pals et mon inventaire</span>} actions={<span className="text-xs text-slate-500">{c.syncedAt ? `mis à jour ${format.timeAgo(c.syncedAt)}` : ''}</span>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Niveau" value={w.level} />
        <Stat label="Pals" value={w.pals.length} />
        <Stat label="Chanceux" value={w.pals.filter((p) => p.lucky).length} />
        <Stat
          label="Guilde"
          value={
            w.guild ? (
              <Link to={`/guildes/${w.guild.id}`} className="text-base text-accent">
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
            ['pals', 'Mes Pals'],
            ['inventory', 'Inventaire'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg px-3 py-1.5 text-sm font-medium', tab === k ? 'bg-accent text-accent-fg' : 'ring-1 ring-slate-200 dark:ring-slate-800')}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4">{tab === 'pals' ? <PalTable pals={w.pals} /> : <InventoryView inventory={w.inventory} />}</div>
    </Card>
  );
}
