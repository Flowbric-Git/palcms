import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, MemoryStick, Pause, Play, PlugZap, Power, RotateCw, Save, Search, Square, Unplug } from 'lucide-react';
import { INI_FIELDS, INI_GROUPS, type ExternalServer, type ServerMode, type ServerStatus } from '@palcms/shared';
import { api, errorText } from '../lib/api';
import { useLiveServer } from '../lib/live';
import { useRealtime } from '../lib/ws';
import { formatBytes, formatDateTime, formatDuration, timeAgo } from '../lib/format';
import { StatusDot } from '../components/live';
import { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Toggle, cx } from '../components/ui';
import { useLoad } from './AdminLayout';
import { useApp } from '../lib/app';
import { ExternalServerForm } from '../components/ExternalServerForm';

type ServiceState = 'active' | 'inactive' | 'activating' | 'deactivating' | 'failed' | 'unknown' | 'external' | 'none';

interface Overview {
  mode: ServerMode;
  service: ServiceState;
  status: ServerStatus;
  host: { cpus: number; load: number; memTotal: number; memFree: number; uptime: number };
  metrics: { ts: number; fps: number; players: number }[];
}

const SERVICE_LABEL: Record<ServiceState, { text: string; tone: 'green' | 'red' | 'amber' | 'slate' }> = {
  active: { text: 'Service actif', tone: 'green' },
  inactive: { text: 'Service arrêté', tone: 'slate' },
  activating: { text: 'Démarrage…', tone: 'amber' },
  deactivating: { text: 'Arrêt…', tone: 'amber' },
  failed: { text: 'Service en échec', tone: 'red' },
  unknown: { text: 'État inconnu', tone: 'slate' },
  external: { text: 'Serveur externe', tone: 'slate' },
  none: { text: 'Aucun serveur connecté', tone: 'amber' },
};

function PlayersChart({ points }: { points: Overview['metrics'] }) {
  if (points.length < 2) return <Empty>Les statistiques apparaîtront après quelques minutes de fonctionnement.</Empty>;
  const max = Math.max(1, ...points.map((p) => p.players));
  const w = 600;
  const h = 120;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - (v / max) * (h - 10);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.players).toFixed(1)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label="Joueurs connectés sur 24 heures">
        <path d={`${line} L${w},${h} L0,${h} Z`} className="fill-accent/15" />
        <path d={line} className="stroke-accent" fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{formatDateTime(points[0].ts)}</span>
        <span>max {max} joueurs</span>
        <span>maintenant</span>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data, error, reload } = useLoad<Overview>('admin/server/overview');
  const live = useLiveServer();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (action: 'start' | 'stop' | 'restart') => {
    const confirmText = {
      start: null,
      stop: 'Arrêter le serveur ? Les joueurs connectés seront déconnectés (le monde est sauvegardé avant).',
      restart: 'Redémarrer le serveur ? Les joueurs connectés seront déconnectés (le monde est sauvegardé avant).',
    }[action];
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setMsg(null);
    try {
      const r = await api.post<{ message: string }>(`admin/server/${action}`);
      setMsg({ kind: 'success', text: r.message });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;
  const status = live.status ?? data.status;
  const svc = SERVICE_LABEL[data.service];
  const memUsed = data.host.memTotal - data.host.memFree;

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description={status.name}
        actions={
          data.mode !== 'managed' ? (
            <Link
              to="/admin/serveur/connexion"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 dark:bg-slate-800 dark:ring-slate-700"
            >
              <PlugZap className="h-4 w-4" /> Connexion au serveur
            </Link>
          ) : (
          <>
            <Button variant="secondary" onClick={() => void act('start')} loading={busy === 'start'} disabled={data.service === 'active'}>
              <Play className="h-4 w-4" /> Démarrer
            </Button>
            <Button variant="secondary" onClick={() => void act('restart')} loading={busy === 'restart'}>
              <RotateCw className="h-4 w-4" /> Redémarrer
            </Button>
            <Button variant="danger" onClick={() => void act('stop')} loading={busy === 'stop'} disabled={data.service === 'inactive'}>
              <Square className="h-4 w-4" /> Arrêter
            </Button>
          </>
          )
        }
      />
      {msg && <Alert kind={msg.kind} className="mb-6">{msg.text}</Alert>}
      {data.mode === 'none' && (
        <Alert kind="warning" className="mb-6">
          Aucun serveur Palworld n’est connecté au site.{' '}
          <Link to="/admin/serveur/connexion" className="font-semibold underline">
            Connecter un serveur
          </Link>
        </Alert>
      )}
      {data.mode === 'external' && (
        <Alert className="mb-6">
          Serveur externe : son démarrage, sa configuration et ses sauvegardes se gèrent sur sa propre machine. Le processeur et la mémoire
          ci-dessous sont ceux du VPS du site.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">Serveur Palworld</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusDot online={status.online} />
            <span className="text-lg font-semibold">{status.online ? 'En ligne' : 'Hors ligne'}</span>
          </div>
          <div className="mt-2">
            <Badge tone={svc.tone}>
              <Power className="h-3 w-3" /> {svc.text}
            </Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Joueurs connectés</p>
          <p className="mt-2 text-3xl font-bold">
            {status.players}
            <span className="text-base text-slate-400"> / {status.maxPlayers}</span>
          </p>
          <Link to="/admin/serveur/joueurs" className="text-xs text-accent">
            Voir les joueurs
          </Link>
        </Card>
        <Card>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Cpu className="h-3 w-3" /> Processeur ({data.host.cpus} cœurs)
          </p>
          <p className="mt-2 text-3xl font-bold">{Math.round((data.host.load / data.host.cpus) * 100)}%</p>
          <p className="text-xs text-slate-500">FPS serveur : {status.fps ?? '—'}</p>
        </Card>
        <Card>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <MemoryStick className="h-3 w-3" /> Mémoire
          </p>
          <p className="mt-2 text-3xl font-bold">{Math.round((memUsed / data.host.memTotal) * 100)}%</p>
          <p className="text-xs text-slate-500">
            {formatBytes(memUsed)} / {formatBytes(data.host.memTotal)}
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Joueurs sur 24 heures">
          <PlayersChart points={data.metrics} />
        </Card>
        <Card title="Informations">
          <dl className="space-y-2 text-sm">
            {[
              ['Version', status.version ?? '—'],
              ['Adresse', status.address || '—'],
              ['Jour en jeu', status.days ?? '—'],
              ['Serveur lancé depuis', status.uptime != null ? formatDuration(status.uptime) : '—'],
              ['VPS allumé depuis', formatDuration(data.host.uptime)],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4">
                <dt className="text-slate-500">{k}</dt>
                <dd className="truncate text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}

// Configuration

interface ConfigEntry {
  key: string;
  type: 'bool' | 'number' | 'string' | 'raw';
  value: boolean | number | string;
  decimals?: boolean;
  locked: boolean;
}

export function ConfigPage() {
  const { data, error, reload } = useLoad<{ entries: ConfigEntry[] }>('admin/server/config');
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [restart, setRestart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.entries.map((e) => [e.key, e.value])));
  }, [data]);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = filter.toLowerCase();
    const match = (e: ConfigEntry) => !q || e.key.toLowerCase().includes(q) || INI_FIELDS[e.key]?.label.toLowerCase().includes(q);
    const known = INI_GROUPS.map((g) => ({
      title: g as string,
      entries: data.entries.filter((e) => INI_FIELDS[e.key]?.group === g && match(e)),
    }));
    const other = data.entries.filter((e) => !INI_FIELDS[e.key] && match(e));
    return [...known, { title: 'Avancé', entries: other }].filter((g) => g.entries.length);
  }, [data, filter]);

  const changed = data ? data.entries.filter((e) => values[e.key] !== e.value) : [];

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = Object.fromEntries(changed.map((e) => [e.key, values[e.key]]));
      const r = await api.put<{ message: string }>('admin/server/config', { values: body, restart });
      setMsg({ kind: 'success', text: r.message });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;

  const input = (e: ConfigEntry) => {
    const meta = INI_FIELDS[e.key];
    const v = values[e.key];
    if (e.type === 'bool') return <Toggle checked={!!v} onChange={(nv) => setValues({ ...values, [e.key]: nv })} label={meta?.label ?? e.key} disabled={e.locked} />;
    const label = (
      <span className="flex items-center gap-2">
        {meta?.label ?? e.key}
        {meta && <span className="font-mono text-[10px] font-normal text-slate-400">{e.key}</span>}
      </span>
    );
    return (
      <Field label={label} help={meta?.help}>
        {(id) =>
          meta?.options ? (
            <Select id={id} value={String(v)} disabled={e.locked} onChange={(ev) => setValues({ ...values, [e.key]: ev.target.value })}>
              {meta.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          ) : (
            <Input
              id={id}
              type={e.type === 'number' ? 'number' : meta?.secret ? 'password' : 'text'}
              step={e.type === 'number' && e.decimals ? '0.1' : undefined}
              value={String(v ?? '')}
              disabled={e.locked}
              onChange={(ev) => setValues({ ...values, [e.key]: e.type === 'number' ? Number(ev.target.value) : ev.target.value })}
            />
          )
        }
      </Field>
    );
  };

  return (
    <>
      <PageHeader title="Configuration du serveur" description="PalWorldSettings.ini — les réglages s'appliquent au redémarrage du serveur." />
      <div className="sticky top-14 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8 dark:border-slate-800 dark:bg-slate-950/90">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Rechercher un réglage…" className="pl-9" />
        </div>
        <Toggle checked={restart} onChange={setRestart} label="Redémarrer après l'enregistrement" />
        <Button onClick={() => void save()} loading={busy} disabled={changed.length === 0}>
          <Save className="h-4 w-4" /> Enregistrer {changed.length > 0 && `(${changed.length})`}
        </Button>
      </div>
      {msg && <Alert kind={msg.kind} className="mb-6">{msg.text}</Alert>}
      <div className="space-y-6">
        {groups.map((g) => (
          <Card key={g.title} title={g.title}>
            <div className="grid gap-4 md:grid-cols-2">
              {g.entries.map((e) => (
                <div key={e.key} className={cx(values[e.key] !== e.value && 'rounded-lg ring-2 ring-accent/40 ring-offset-4 ring-offset-white dark:ring-offset-slate-900')}>
                  {input(e)}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

// Joueurs

interface PlayersData {
  online: { uid: string; name: string; level: number; ping: number; ip: string }[];
  history: {
    uid: string;
    publicId: string;
    name: string;
    level: number;
    online: number;
    firstSeen: number;
    lastSeen: number;
    playtimeSeconds: number;
    member: string | null;
  }[];
}

export function PlayersPage() {
  const { data, error, reload } = useLoad<PlayersData>('admin/server/players');
  const [q, setQ] = useState('');
  useRealtime('public', (m) => {
    if (m.type === 'players') reload();
  });
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;
  const hist = data.history.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase()) || h.uid.includes(q));
  return (
    <>
      <PageHeader title="Joueurs" description="Joueurs connectés en direct et historique de tous les joueurs vus sur le serveur." />
      <Card title={`En ligne (${data.online.length})`}>
        {data.online.length === 0 ? (
          <Empty>Aucun joueur connecté.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2">Nom</th>
                  <th className="py-2">Niveau</th>
                  <th className="py-2">Ping</th>
                  <th className="py-2">Identifiant</th>
                  <th className="py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.online.map((p) => (
                  <tr key={p.uid} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2">{p.level}</td>
                    <td className="py-2">{p.ping} ms</td>
                    <td className="py-2 font-mono text-xs">{p.uid}</td>
                    <td className="py-2 font-mono text-xs">{p.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">Expulsion, bannissement et liste blanche : rubrique Modération.</p>
      </Card>
      <Card title={`Historique (${data.history.length})`} className="mt-6" actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer…" className="w-48" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="py-2">Nom</th>
                <th className="py-2">Niveau</th>
                <th className="py-2">Temps de jeu</th>
                <th className="py-2">Dernière connexion</th>
                <th className="py-2">Membre du site</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((p) => (
                <tr key={p.uid} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 font-medium">
                    <Link to={`/joueurs/${p.publicId}`} className="flex items-center gap-2 hover:text-accent">
                      {p.online === 1 && <span className="h-2 w-2 rounded-full bg-green-500" />}
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2">{p.level}</td>
                  <td className="py-2">{formatDuration(p.playtimeSeconds)}</td>
                  <td className="py-2 text-slate-500">{p.online === 1 ? 'En ligne' : timeAgo(p.lastSeen)}</td>
                  <td className="py-2">{p.member ?? <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// Logs

export function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLPreElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    api
      .get<{ lines: string[] }>('admin/server/logs?lines=300')
      .then((r) => setLines(r.lines))
      .catch((e) => setError(errorText(e)));
  }, []);

  useRealtime('logs', (m) => {
    if (m.type === 'log' && !pausedRef.current) setLines((l) => [...l, m.data].slice(-2000));
    if (m.type === 'error') setError(m.data);
  });

  useEffect(() => {
    if (!paused) ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines, paused]);

  const shown = filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  return (
    <>
      <PageHeader
        title="Logs du serveur"
        description="Journal du service palworld, en direct."
        actions={
          <>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…" className="w-48" />
            <Button variant="secondary" onClick={() => setPaused(!paused)}>
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? 'Reprendre' : 'Pause'}
            </Button>
          </>
        }
      />
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}
      <pre ref={ref} className="h-[65vh] overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
        {shown.join('\n') || 'Aucune ligne.'}
      </pre>
    </>
  );
}

// Connexion au serveur

export function ConnectionPage() {
  const { refresh } = useApp();
  const { data, error, reload } = useLoad<{ mode: ServerMode; external: (ExternalServer & { hasPassword: boolean }) | null }>(
    'admin/server/connection',
  );
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;

  if (data.mode === 'managed') {
    return (
      <>
        <PageHeader title="Connexion au serveur" />
        <Card>
          <p className="flex items-center gap-2 font-semibold">
            <PlugZap className="h-5 w-5 text-accent" /> Serveur installé et géré par PalCMS
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Le serveur Palworld tourne sur ce VPS et PalCMS le pilote directement : démarrage, configuration, sauvegardes, mises à jour. Rien à
            configurer ici.
          </p>
        </Card>
      </>
    );
  }

  const disconnect = async () => {
    if (!window.confirm('Déconnecter ce serveur ? Le site restera en ligne, sans statut ni joueurs en direct, jusqu’à la connexion d’un autre serveur.')) return;
    try {
      await api.del('admin/server/connection');
      await refresh();
      reload();
      setMsg({ kind: 'success', text: 'Serveur déconnecté.' });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  const connected = data.mode === 'external' && data.external;
  return (
    <>
      <PageHeader
        title="Connexion au serveur"
        description="Connecte un serveur Palworld existant (sur ce VPS ou ailleurs) grâce à son API REST."
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      {connected && !editing ? (
        <Card>
          <p className="flex items-center gap-2 font-semibold">
            <PlugZap className="h-5 w-5 text-green-500" /> Serveur connecté
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">API REST</dt>
              <dd className="font-mono">
                {data.external!.apiHost}:{data.external!.apiPort}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Adresse pour les joueurs</dt>
              <dd className="font-mono">{data.external!.publicAddress || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">RCON</dt>
              <dd>{data.external!.rconPort ? `port ${data.external!.rconPort}` : 'non configuré'}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Modifier
            </Button>
            <Button variant="danger" onClick={() => void disconnect()}>
              <Unplug className="h-4 w-4" /> Déconnecter
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          {!connected && (
            <Alert kind="warning" className="mb-5">
              Aucun serveur n’est connecté pour le moment.
            </Alert>
          )}
          <ExternalServerForm
            initial={data.external}
            passwordOptional={!!data.external?.hasPassword}
            testPath="admin/server/connection/test"
            submitLabel={connected ? 'Enregistrer' : 'Connecter ce serveur'}
            onSave={async (value) => {
              await api.put('admin/server/connection', value);
              await refresh();
              setEditing(false);
              reload();
              setMsg({ kind: 'success', text: 'Serveur connecté : le statut et les joueurs apparaissent en quelques secondes.' });
            }}
          />
          {connected && (
            <Button variant="ghost" className="mt-3" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          )}
        </Card>
      )}
    </>
  );
}
