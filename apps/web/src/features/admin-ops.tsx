import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarPlus,
  Check,
  Download,
  Gavel,
  HardDrive,
  Play,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  StickyNote,
  Trash2,
  UserX,
  X,
} from 'lucide-react';
import { INI_FIELDS, INI_GROUP_LABELS, type IniGroup } from '@palcms/shared';
import { api, errorText } from '../lib/api';
import { useApp } from '../lib/app';
import * as format from '../lib/format';
import * as ui from '../components/ui';
import { useLoad } from '../lib/useLoad';
import { BarChart } from './components';
import { InventoryView, PalTable, statName, type InventoryGroup, type PalView } from './world-public';
import { num, t, tm } from '../lib/i18n';

const { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle, cx } = ui;

type Msg = { kind: 'success' | 'error'; text: string } | null;

function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (success) setMsg({ kind: 'success', text: t(success) });
      return true;
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, msg, run, setMsg };
}

const Message = ({ msg }: { msg: Msg }) => (msg ? <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert> : null);

// Monitoring

interface Health {
  mode: string;
  service: string;
  status: { online: boolean; players: number; maxPlayers: number; uptime: number | null };
  metrics: { fps: number; frameTime: number; players: number; maxPlayers: number; baseCamps: number | null; days: number | null; uptime: number } | null;
  host: { cpus: number; load: number; memory: { total: number; available: number }; disk: { total: number; free: number } | null };
  apis: { rest: boolean; rcon: boolean | null; world: number | null };
  thresholds: { enabled: boolean; fpsLow: number; memoryHigh: number; diskLow: number };
  openAlerts: number;
}

interface AlertItem {
  id: number;
  ts: number;
  level: 'info' | 'warning' | 'critical';
  kind: string;
  message: string;
  resolvedAt: number | null;
}

function Gauge({ label, value, unit, percent, tone, sub }: { label: string; value: ReactNode; unit?: string; percent: number; tone: 'green' | 'amber' | 'red'; sub?: ReactNode }) {
  const color = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone];
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(2, percent))}%` }} />
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const Dot = ({ ok, label }: { ok: boolean | null; label: string }) => (
  <span className="flex items-center gap-2 text-sm">
    <span className={cx('h-2.5 w-2.5 rounded-full', ok === null ? 'bg-slate-400' : ok ? 'bg-green-500' : 'bg-red-500')} />
    {label}
  </span>
);

export function MonitoringPage() {
  const { boot } = useApp();
  const health = useLoad<Health>('features/monitoring/health');
  const alerts = useLoad<{ items: AlertItem[] }>('features/monitoring/alerts');
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const history = useLoad<{ points: { ts: number; fps: number; players: number; frameTime: number }[] }>(`features/monitoring/history?range=${range}`);
  const [th, setTh] = useState<Health['thresholds'] | null>(null);
  const [shutdown, setShutdown] = useState({ seconds: 60, message: t('Server shutting down for maintenance.') });
  const a = useAction();
  const perms = new Set(boot.user?.permissions);

  useEffect(() => {
    const timer = setInterval(health.reload, 10_000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (health.data && !th) setTh(health.data.thresholds);
  }, [health.data, th]);

  if (health.error) return <Alert kind="error">{health.error}</Alert>;
  const h = health.data;
  if (!h) return <Spinner />;
  const lim = h.thresholds;
  const memPct = Math.round((1 - h.host.memory.available / h.host.memory.total) * 100);
  const diskFree = h.host.disk ? Math.round((h.host.disk.free / h.host.disk.total) * 100) : null;
  const cpuPct = Math.round((h.host.load / h.host.cpus) * 100);
  const fps = h.metrics?.fps ?? 0;

  return (
    <>
      <PageHeader
        title={t('Monitoring')}
        description={t('Live state of the server and the VPS, automatic alerts and history.')}
        actions={
          perms.has('server.control') && h.status.online ? (
            <Button variant="secondary" loading={a.busy === 'save'} onClick={() => void a.run('save', () => api.post('features/monitoring/save'), 'World saved to disk.')}>
              <Save className="h-4 w-4" /> {t('Save the world')}
            </Button>
          ) : undefined
        }
      />
      <Message msg={a.msg} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Gauge
          label={t('Server FPS')}
          value={h.metrics ? fps : '—'}
          percent={(fps / 60) * 100}
          tone={!h.metrics || fps < lim.fpsLow ? 'red' : fps < 40 ? 'amber' : 'green'}
          sub={h.metrics ? t('Frame time: {ms} ms', { ms: h.metrics.frameTime }) : t('Server offline')}
        />
        <Gauge
          label={t('Players')}
          value={h.metrics ? `${h.metrics.players} / ${h.metrics.maxPlayers}` : '—'}
          percent={h.metrics ? (h.metrics.players / Math.max(1, h.metrics.maxPlayers)) * 100 : 0}
          tone="green"
          sub={h.metrics?.baseCamps != null ? t('{bases} bases · day {day}', { bases: h.metrics.baseCamps, day: h.metrics.days ?? '—' }) : undefined}
        />
        <Gauge
          label={t('CPU')}
          value={cpuPct}
          unit="%"
          percent={cpuPct}
          tone={cpuPct > 90 ? 'red' : cpuPct > 70 ? 'amber' : 'green'}
          sub={t('{count} cores · load {load}', { count: h.host.cpus, load: h.host.load.toFixed(2) })}
        />
        <Gauge
          label={t('Memory')}
          value={memPct}
          unit="%"
          percent={memPct}
          tone={memPct >= lim.memoryHigh ? 'red' : memPct >= lim.memoryHigh - 10 ? 'amber' : 'green'}
          sub={`${format.formatBytes(h.host.memory.total - h.host.memory.available)} / ${format.formatBytes(h.host.memory.total)}`}
        />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('Connections')}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Dot ok={h.apis.rest} label={t('Palworld REST API')} />
            <Dot ok={h.apis.rcon} label={h.apis.rcon === null ? t('RCON (unknown)') : h.apis.rcon ? t('RCON on') : t('RCON off')} />
            <Dot ok={h.service === 'active' || h.mode !== 'managed' ? h.status.online : false} label={t('Service: {state}', { state: h.service })} />
            <Dot
              ok={h.apis.world ? Date.now() - h.apis.world < 3 * 3600_000 : null}
              label={h.apis.world ? t('World read {when}', { when: format.timeAgo(h.apis.world) }) : t('World never read')}
            />
          </div>
          {h.host.disk && (
            <p className="mt-4 flex items-center gap-2 text-sm">
              <HardDrive className="h-4 w-4 text-slate-500" />
              {t('Disk: {free} free of {total}', { free: format.formatBytes(h.host.disk.free), total: format.formatBytes(h.host.disk.total) })}
              <Badge tone={diskFree !== null && diskFree <= lim.diskLow ? 'red' : 'slate'}>{diskFree} %</Badge>
            </p>
          )}
        </Card>
        {perms.has('server.control') && h.mode === 'managed' && (
          <Card title={t('Clean shutdown')}>
            <p className="mb-3 text-sm text-slate-500">{t('The server shows the message to players, waits for the delay, saves the world then stops.')}</p>
            <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
              <Field label={t('Delay (s)')}>{(id) => <Input id={id} type="number" min={10} max={3600} value={shutdown.seconds} onChange={(e) => setShutdown({ ...shutdown, seconds: Number(e.target.value) })} />}</Field>
              <Field label={t('Message')}>{(id) => <Input id={id} value={shutdown.message} onChange={(e) => setShutdown({ ...shutdown, message: e.target.value })} />}</Field>
              <Button
                variant="danger"
                disabled={!h.status.online}
                loading={a.busy === 'shutdown'}
                onClick={() => {
                  if (window.confirm(t('Stop the server in {n} seconds?', { n: shutdown.seconds })))
                    void a.run('shutdown', () => api.post('features/monitoring/shutdown', shutdown), 'Shutdown scheduled.');
                }}
              >
                <Power className="h-4 w-4" /> {t('Stop')}
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Card
        className="mt-6"
        title={t('History')}
        actions={
          <div className="flex gap-1">
            {(['24h', '7d', '30d'] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={cx('rounded-lg px-2.5 py-1 text-xs font-medium', range === r ? 'bg-accent text-accent-fg' : 'ring-1 ring-slate-200 dark:ring-slate-800')}>
                {{ '24h': '24 h', '7d': t('7 days'), '30d': t('30 days') }[r]}
              </button>
            ))}
          </div>
        }
      >
        {!history.data ? (
          <Spinner />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">{t('Players online')}</p>
              <BarChart points={history.data.points.map((p) => ({ label: format.formatDateTime(p.ts), value: p.players }))} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">{t('Average FPS')}</p>
              <BarChart points={history.data.points.map((p) => ({ label: format.formatDateTime(p.ts), value: p.fps }))} />
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title={h.openAlerts ? t('Alerts ({count} open)', { count: h.openAlerts }) : t('Alerts')}
          actions={
            h.openAlerts > 0 && (
              <Button variant="ghost" onClick={() => void a.run('clear', () => api.post('features/monitoring/alerts/clear')).then(() => { alerts.reload(); health.reload(); })}>
                <Check className="h-4 w-4" /> {t('Mark all as resolved')}
              </Button>
            )
          }
        >
          {!alerts.data ? (
            <Spinner />
          ) : alerts.data.items.length === 0 ? (
            <Empty>{t('No alert. All good!')}</Empty>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {alerts.data.items.map((al) => (
                <li key={al.id} className={cx('flex items-start gap-3 rounded-lg p-2 text-sm', !al.resolvedAt && 'bg-amber-50 dark:bg-amber-500/10')}>
                  <AlertTriangle className={cx('mt-0.5 h-4 w-4 shrink-0', al.level === 'critical' ? 'text-red-500' : 'text-amber-500')} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{tm(al.message)}</p>
                    <p className="text-xs text-slate-500">
                      {format.formatDateTime(al.ts)}
                      {al.resolvedAt ? ` · ${t('resolved {when}', { when: format.timeAgo(al.resolvedAt) })}` : ` · ${t('open')}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {th && perms.has('server.config') && (
          <Card title={t('Alert thresholds')} className="h-fit">
            <div className="space-y-3">
              <Toggle checked={th.enabled} onChange={(v) => setTh({ ...th, enabled: v })} label={t('Alerts on')} description={t('Shown here and sent to Discord when set up.')} />
              <Field label={t('Minimum FPS')}>{(id) => <Input id={id} type="number" min={1} max={60} value={th.fpsLow} onChange={(e) => setTh({ ...th, fpsLow: Number(e.target.value) })} />}</Field>
              <Field label={t('Maximum memory (%)')}>{(id) => <Input id={id} type="number" min={50} max={100} value={th.memoryHigh} onChange={(e) => setTh({ ...th, memoryHigh: Number(e.target.value) })} />}</Field>
              <Field label={t('Minimum free disk (%)')}>{(id) => <Input id={id} type="number" min={1} max={50} value={th.diskLow} onChange={(e) => setTh({ ...th, diskLow: Number(e.target.value) })} />}</Field>
              <Button variant="secondary" loading={a.busy === 'th'} onClick={() => void a.run('th', () => api.put('features/monitoring/thresholds', th), 'Thresholds saved.')}>
                {t('Save')}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

// Attendance statistics

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function StatsPage() {
  const { data, error } = useLoad<{
    heatmap: number[][];
    daily: { day: string; unique: number; newcomers: number; returning: number }[];
    averageSessionSeconds: number;
    activeLast7Days: number;
    returningRate: number;
    totalPlayers: number;
  }>('features/stats/attendance');
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;
  const max = Math.max(1, ...data.heatmap.flat());
  const kpi = (label: string, value: ReactNode) => (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
  const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return (
    <>
      <PageHeader title={t('Attendance statistics')} description={t('Computed over the last 30 days from game sessions.')} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpi(t('Active players (7 days)'), data.activeLast7Days)}
        {kpi(t('Returning players'), `${data.returningRate} %`)}
        {kpi(t('Average session'), format.formatDuration(data.averageSessionSeconds))}
        {kpi(t('Players since the start'), data.totalPlayers)}
      </div>
      <Card className="mt-6" title={t('Peak hours')} actions={<span className="text-xs text-slate-500">{t('average number of players online')}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0.5 text-[10px]">
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, i) => (
                  <th key={i} className="font-normal text-slate-500">
                    {i % 3 === 0 ? i : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.heatmap.map((row, d) => (
                <tr key={d}>
                  <td className="pr-2 text-right text-slate-500">{t(WEEKDAYS[d])}</td>
                  {row.map((v, hIdx) => (
                    <td key={hIdx} title={t('{day} {hour} h: {n} player(s)', { day: t(WEEKDAYS[d]), hour: hIdx, n: v })} className="h-6 min-w-5 rounded-sm" style={{ background: v ? `color-mix(in srgb, var(--accent) ${Math.round(15 + (v / max) * 85)}%, transparent)` : undefined }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title={t('Unique players per day')}>
          <BarChart points={data.daily.map((d) => ({ label: shortDay(d.day), value: d.unique }))} />
        </Card>
        <Card title={t('New players per day')}>
          <BarChart points={data.daily.map((d) => ({ label: shortDay(d.day), value: d.newcomers }))} />
        </Card>
      </div>
    </>
  );
}

// World data

interface WorldStatus {
  available: boolean;
  settings: { enabled: boolean; intervalMinutes: number; live: boolean };
  running: boolean;
  installing: boolean;
  lastAt: number | null;
  lastDurationMs: number | null;
  lastError: string | null;
  counts: { players: number; pals: number; guilds: number; bases: number };
}

export function WorldPage() {
  const status = useLoad<WorldStatus>('features/world/status');
  const players = useLoad<{ history: { uid: string; publicId: string; name: string; level: number; online: number; lastSeen: number }[] }>('admin/server/players');
  const guilds = useLoad<{ guilds: { id: string; name: string; level: number; memberCount: number; baseCount: number; leader: string | null }[] }>('features/guilds');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ item: string; itemName: string; player: string; publicId: string | null; count: number; container: string }[] | null>(null);
  const [settings, setSettings] = useState<WorldStatus['settings'] | null>(null);
  const [filter, setFilter] = useState('');
  const a = useAction();
  useEffect(() => {
    if (status.data && !settings) setSettings(status.data.settings);
  }, [status.data, settings]);

  if (status.error) return <Alert kind="error">{status.error}</Alert>;
  const s = status.data;
  if (!s) return <Spinner />;

  const search = () => void a.run('search', async () => setResults((await api.get<{ results: NonNullable<typeof results> }>(`features/world/items?q=${encodeURIComponent(q)}`)).results));
  const sync = () =>
    void a
      .run('sync', () => api.post('features/world/sync'), 'World save read.')
      .then(() => {
        status.reload();
        guilds.reload();
      });

  return (
    <>
      <PageHeader
        title={t('World data')}
        description={t('Inventories, Pals, guilds and bases, read straight from the server save.')}
        actions={
          s.available && (
            <Button loading={a.busy === 'sync' || s.running} onClick={sync}>
              <RefreshCw className="h-4 w-4" /> {t('Read now')}
            </Button>
          )
        }
      />
      <Message msg={a.msg} />
      {!s.available ? (
        <Alert kind="info">{t('Reading saves only works for a server installed by PalCMS on this VPS.')}</Alert>
      ) : (
        <>
          {s.lastError && <Alert kind="error" className="mb-4">{t('Last read failed: {error}', { error: tm(s.lastError) })}</Alert>}
          {s.installing && <Alert kind="info" className="mb-4">{t('Installing the save reader (sav_cli)…')}</Alert>}
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                {(
                  [
                    [t('Players'), s.counts.players],
                    [t('Pals'), s.counts.pals],
                    [t('Guilds'), s.counts.guilds],
                    [t('Bases'), s.counts.bases],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l}>
                    <p className="text-xs text-slate-500">{l}</p>
                    <p className="text-2xl font-bold">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {s.lastAt
                  ? t('Last read {when} ({s} s)', { when: format.timeAgo(s.lastAt), s: Math.round((s.lastDurationMs ?? 0) / 1000) })
                  : t('Never read: click "Read now"')}
              </p>
            </Card>
            {settings && (
              <Card title={t('Automatic reading')}>
                <div className="space-y-3">
                  <Toggle checked={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} label={t('Enabled')} description={t('Only when someone played since the last read.')} />
                  <Toggle
                    checked={settings.live ?? true}
                    onChange={(v) => setSettings({ ...settings, live: v })}
                    label={t('Live while players are online')}
                    description={t('Quick read every 30 s: profiles and the Paldex follow the game. Spaced out on its own if the world is big.')}
                  />
                  <Select value={settings.intervalMinutes} onChange={(e) => setSettings({ ...settings, intervalMinutes: Number(e.target.value) })}>
                    {[5, 10, 15, 30, 60, 120].map((m) => (
                      <option key={m} value={m}>
                        {m < 60 ? t('Every {n} min', { n: m }) : t('Every {n} h', { n: m / 60 })}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" loading={a.busy === 'settings'} onClick={() => void a.run('settings', () => api.put('features/world/settings', settings), 'Settings saved.')}>
                    {t('Save')}
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <Card className="mt-6" title={t('Find an item')} actions={<span className="text-xs text-slate-500">{t('Who owns what (English names)')}</span>}>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
            >
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('e.g. Legendary Sphere, Gold Coin, ingot…')} />
              <Button type="submit" loading={a.busy === 'search'} disabled={q.trim().length < 2}>
                <Search className="h-4 w-4" /> {t('Search')}
              </Button>
            </form>
            {results &&
              (results.length === 0 ? (
                <Empty>{t('No player owns this item.')}</Empty>
              ) : (
                <table className="mt-4 w-full text-sm">
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 font-medium">{r.publicId ? <Link to={`/admin/server/world/${r.publicId}`} className="hover:text-accent">{r.player}</Link> : r.player}</td>
                        <td className="py-1.5">{r.itemName}</td>
                        <td className="py-1.5 text-xs text-slate-500">{t(r.container)}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums">×{num(r.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title={t('Players')} actions={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Filter…')} className="w-40" />}>
              {!players.data ? (
                <Spinner />
              ) : (
                <ul className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {players.data.history
                    .filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
                    .map((p) => (
                      <li key={p.uid}>
                        <Link to={`/admin/server/world/${p.publicId}`} className="flex items-center gap-2 py-2 text-sm hover:text-accent">
                          <span className={cx('h-2 w-2 rounded-full', p.online ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700')} />
                          <span className="flex-1 font-medium">{p.name}</span>
                          <span className="text-xs text-slate-500">{t('lvl {level}', { level: p.level })}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
            <Card title={t('Guilds')}>
              {!guilds.data ? (
                <Spinner />
              ) : guilds.data.guilds.length === 0 ? (
                <Empty>{t('No guild.')}</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {guilds.data.guilds.map((g) => (
                    <li key={g.id}>
                      <Link to={`/guilds/${g.id}`} className="flex items-center gap-2 py-2 text-sm hover:text-accent">
                        <span className="flex-1 font-medium">{g.name}</span>
                        <span className="text-xs text-slate-500">
                          {t('lvl {level}', { level: g.level })} · {t('{n} member(s)', { n: g.memberCount })} · {t('{n} base(s)', { n: g.baseCount })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export function WorldPlayerPage() {
  const { id } = useParams();
  const { data, error } = useLoad<{
    name: string;
    level: number;
    exp: number;
    hp: number;
    stomach: number;
    statusPoints: Record<string, number>;
    inventory: InventoryGroup[];
    pals: PalView[];
    guild: { id: string; name: string; level: number } | null;
    syncedAt: number;
  }>(`features/world/players/${id}`);
  const players = useLoad<{ history: { uid: string; publicId: string }[] }>('admin/server/players');
  const uid = players.data?.history.find((p) => p.publicId === id)?.uid;
  return (
    <>
      <PageHeader
        title={data?.name ?? t('Player')}
        description={data ? t('Read from the save {when}', { when: format.timeAgo(data.syncedAt) }) : undefined}
        actions={
          <>
            {uid && (
              <Link to={`/admin/server/sanctions?player=${encodeURIComponent(uid)}`}>
                <Button variant="secondary">
                  <Gavel className="h-4 w-4" /> {t('Sanctions')}
                </Button>
              </Link>
            )}
            <Link to={`/players/${id}`}>
              <Button variant="ghost">{t('Public profile')}</Button>
            </Link>
          </>
        }
      />
      {error ? (
        <Alert kind="info">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(
              [
                [t('Level'), data.level],
                [t('Experience'), num(data.exp)],
                [t('Pals'), data.pals.length],
                [t('Guild'), data.guild ? <Link to={`/guilds/${data.guild.id}`} className="text-accent">{data.guild.name}</Link> : '—'],
              ] as const
            ).map(([l, v]) => (
              <Card key={l}>
                <p className="text-xs text-slate-500">{l}</p>
                <p className="mt-1 text-xl font-bold">{v}</p>
              </Card>
            ))}
          </div>
          {Object.keys(data.statusPoints).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.statusPoints).map(([k, v]) => (
                <Badge key={k}>
                  {statName(k)} +{v}
                </Badge>
              ))}
            </div>
          )}
          <Card title={t('Inventory')}>
            <InventoryView inventory={data.inventory} />
          </Card>
          <Card title={`Pals (${data.pals.length})`}>
            <PalTable pals={data.pals} />
          </Card>
        </div>
      )}
    </>
  );
}

// Events and presets

type Values = Record<string, string | number | boolean>;
interface ConfigEntry {
  key: string;
  type: string;
  value: string | number | boolean;
}
interface Preset {
  id: string;
  name: string;
  description: string;
  values: Values;
  builtin: boolean;
  changes: string[];
}
interface AdminEvent {
  id: number;
  name: string;
  description: string;
  startsAt: number;
  endsAt: number;
  values: Values;
  changes: string[];
  restart: boolean;
  isPublic: boolean;
  status: 'scheduled' | 'active' | 'done' | 'cancelled' | 'failed';
  error: string | null;
}

const GAME_GROUPS: IniGroup[] = ['gameplay', 'rates', 'players', 'pals', 'buildings', 'guilds'];
const iniLabel = (k: string) => (INI_FIELDS[k] ? t(INI_FIELDS[k].label) : k);

/** Game settings editor: pick a setting, then its value according to its type. */
function ValuesEditor({ values, onChange, entries }: { values: Values; onChange: (v: Values) => void; entries: ConfigEntry[] }) {
  const keys = useMemo(
    () =>
      entries
        .filter((e) => INI_FIELDS[e.key] && GAME_GROUPS.includes(INI_FIELDS[e.key].group))
        .sort((a, b) => iniLabel(a.key).localeCompare(iniLabel(b.key))),
    [entries],
  );
  const [add, setAdd] = useState('');
  const typeOf = (k: string) => entries.find((e) => e.key === k)?.type ?? 'string';
  const input = (k: string, v: string | number | boolean) => {
    const opts = INI_FIELDS[k]?.options;
    if (typeof v === 'boolean' || typeOf(k) === 'bool') return <Toggle checked={!!v} onChange={(b) => onChange({ ...values, [k]: b })} label={v ? t('On') : t('Off')} />;
    if (opts)
      return (
        <Select value={String(v)} onChange={(e) => onChange({ ...values, [k]: e.target.value })}>
          {opts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      );
    if (typeOf(k) === 'number') return <Input type="number" step="0.1" value={Number(v)} onChange={(e) => onChange({ ...values, [k]: Number(e.target.value) })} />;
    return <Input value={String(v)} onChange={(e) => onChange({ ...values, [k]: e.target.value })} />;
  };
  return (
    <div className="space-y-2">
      {Object.entries(values).map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-sm">{iniLabel(k)}</span>
          {input(k, v)}
          <button
            onClick={() => {
              const next = { ...values };
              delete next[k];
              onChange(next);
            }}
            className="rounded p-1 text-slate-400 hover:text-red-500"
            aria-label={t('Remove')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Select value={add} onChange={(e) => setAdd(e.target.value)}>
          <option value="">{t('Add a setting…')}</option>
          {GAME_GROUPS.map((g) => (
            <optgroup key={g} label={t(INI_GROUP_LABELS[g])}>
              {keys
                .filter((e) => INI_FIELDS[e.key].group === g && !(e.key in values))
                .map((e) => (
                  <option key={e.key} value={e.key}>
                    {iniLabel(e.key)}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        <Button
          variant="secondary"
          disabled={!add}
          onClick={() => {
            const cur = entries.find((e) => e.key === add);
            if (cur) onChange({ ...values, [add]: cur.value });
            setAdd('');
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const toLocalInput = (ts: number) => {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

const EVENT_STATUS: Record<AdminEvent['status'], { label: string; tone: 'accent' | 'green' | 'slate' | 'red' | 'amber' }> = {
  scheduled: { label: 'Planned', tone: 'accent' },
  active: { label: 'Running', tone: 'green' },
  done: { label: 'Finished', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
};

export function EventsPage() {
  const { boot } = useApp();
  const config = useLoad<{ entries: ConfigEntry[] }>(boot.serverMode === 'managed' ? 'admin/server/config' : null);
  const presets = useLoad<Preset[]>('features/presets');
  const events = useLoad<AdminEvent[]>('features/events');
  const a = useAction();
  const now = Date.now();
  const [ev, setEv] = useState({
    name: '',
    description: '',
    startsAt: toLocalInput(now + 3600_000),
    endsAt: toLocalInput(now + 3 * 86_400_000),
    values: { ExpRate: 3 } as Values,
    restart: true,
    isPublic: true,
  });
  const [preset, setPreset] = useState({ name: '', description: '', values: {} as Values });
  const [creating, setCreating] = useState(false);

  if (boot.serverMode !== 'managed') return <Alert kind="info">{t('Events and presets change the configuration: they need a server installed by PalCMS.')}</Alert>;
  if (config.error) return <Alert kind="error">{config.error}</Alert>;
  if (!config.data || !presets.data || !events.data) return <Spinner />;
  const entries = config.data.entries;

  const exportConfig = async () => {
    const data = await api.get<unknown>('features/config/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `palworld-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importConfig = async (file: File | undefined) => {
    if (!file) return;
    const json = JSON.parse(await file.text()) as { values?: Values };
    if (!json.values) throw new Error(t('Invalid file: no setting found'));
    const restart = window.confirm(t('Restart the server to apply right away? (Cancel = on the next restart)'));
    const r = await api.post<{ applied: number; ignored: number }>('features/config/import', { values: json.values, restart });
    a.setMsg({
      kind: 'success',
      text: r.ignored
        ? t('{n} settings imported, {ignored} ignored (passwords or unknown).', { n: r.applied, ignored: r.ignored })
        : t('{n} settings imported.', { n: r.applied }),
    });
  };

  return (
    <>
      <PageHeader
        title={t('Events and presets')}
        description={t('Change the server rules for a period (XP x3 weekend…) or in one click.')}
        actions={
          <>
            <Button variant="secondary" onClick={() => void a.run('export', exportConfig)}>
              <ArrowDownToLine className="h-4 w-4" /> {t('Export the config')}
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:ring-slate-700">
              <ArrowUpFromLine className="h-4 w-4" /> {t('Import')}
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => void a.run('import', () => importConfig(e.target.files?.[0]))} />
            </label>
          </>
        }
      />
      <Message msg={a.msg} />

      <Card
        title={t('Events')}
        actions={
          <Button onClick={() => setCreating(!creating)}>
            <CalendarPlus className="h-4 w-4" /> {t('New event')}
          </Button>
        }
      >
        {creating && (
          <div className="mb-6 space-y-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t('Name')}>{(id) => <Input id={id} value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} placeholder={t('XP x3 weekend')} />}</Field>
              <Field label={t('Description (optional)')}>{(id) => <Input id={id} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} />}</Field>
              <Field label={t('Start')}>{(id) => <Input id={id} type="datetime-local" value={ev.startsAt} onChange={(e) => setEv({ ...ev, startsAt: e.target.value })} />}</Field>
              <Field label={t('End')}>{(id) => <Input id={id} type="datetime-local" value={ev.endsAt} onChange={(e) => setEv({ ...ev, endsAt: e.target.value })} />}</Field>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t('Settings during the event')}</p>
              <ValuesEditor values={ev.values} onChange={(values) => setEv({ ...ev, values })} entries={entries} />
              <p className="mt-2 text-xs text-slate-500">{t('At the end, the previous values are put back automatically.')}</p>
            </div>
            <div className="flex flex-wrap gap-6">
              <Toggle checked={ev.restart} onChange={(v) => setEv({ ...ev, restart: v })} label={t('Restart the server')} description={t('Needed for Palworld to apply the new rates. Players are warned 15 and 5 min before.')} />
              <Toggle checked={ev.isPublic} onChange={(v) => setEv({ ...ev, isPublic: v })} label={t('Visible on the site')} description={t('Calendar and countdown on the home page.')} />
            </div>
            <Button
              loading={a.busy === 'event'}
              disabled={!ev.name || !Object.keys(ev.values).length}
              onClick={() =>
                void a
                  .run('event', () => api.post('features/events', { ...ev, startsAt: new Date(ev.startsAt).getTime(), endsAt: new Date(ev.endsAt).getTime() }), 'Event scheduled.')
                  .then((ok) => {
                    if (ok) setCreating(false);
                    events.reload();
                  })
              }
            >
              {t('Schedule')}
            </Button>
          </div>
        )}
        {events.data.length === 0 ? (
          <Empty>{t('No event.')}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.data.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {e.name} <Badge tone={EVENT_STATUS[e.status].tone}>{t(EVENT_STATUS[e.status].label)}</Badge>
                    {!e.isPublic && <Badge>{t('private')}</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {format.formatDateTime(e.startsAt)} → {format.formatDateTime(e.endsAt)} · {e.changes.map(tm).join(', ')}
                  </p>
                  {e.error && <p className="text-xs text-red-500">{tm(e.error)}</p>}
                </div>
                {e.status === 'scheduled' && (
                  <Button variant="secondary" loading={a.busy === `start${e.id}`} onClick={() => void a.run(`start${e.id}`, () => api.post(`features/events/${e.id}/start-now`), 'Event started.').then(events.reload)}>
                    <Play className="h-4 w-4" /> {t('Start now')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  loading={a.busy === `del${e.id}`}
                  onClick={() => {
                    const label =
                      e.status === 'active'
                        ? t('Stop the event and put the previous settings back?')
                        : e.status === 'scheduled'
                          ? t('Cancel this event?')
                          : t('Remove from the list?');
                    if (window.confirm(label)) void a.run(`del${e.id}`, () => api.del(`features/events/${e.id}`)).then(events.reload);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6" title={t('Presets')}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {presets.data.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl p-4 ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="flex items-center gap-2 font-semibold">
                {p.builtin ? t(p.name) : p.name} {!p.builtin && <Badge tone="accent">{t('custom')}</Badge>}
              </p>
              <p className="mt-1 text-xs text-slate-500">{p.builtin ? t(p.description) : p.description}</p>
              <p className="mt-2 flex-1 text-xs">{p.changes.map(tm).join(' · ')}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  loading={a.busy === `apply${p.id}`}
                  onClick={() => {
                    const name = p.builtin ? t(p.name) : p.name;
                    const restart = window.confirm(
                      t('Apply "{name}" and restart the server now?\n\nCancel = apply without restarting (used on the next restart).', { name }),
                    );
                    void a.run(`apply${p.id}`, () => api.post(`features/presets/${p.id}/apply`, { restart }), t('Preset "{name}" applied.', { name }));
                  }}
                >
                  {t('Apply')}
                </Button>
                {!p.builtin && (
                  <Button variant="ghost" onClick={() => void a.run(`delp${p.id}`, () => api.del(`features/presets/${p.id}`)).then(presets.reload)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-sm font-semibold">{t('Create a preset')}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input value={preset.name} onChange={(e) => setPreset({ ...preset, name: e.target.value })} placeholder={t('Name')} />
            <Input value={preset.description} onChange={(e) => setPreset({ ...preset, description: e.target.value })} placeholder={t('Description (optional)')} />
          </div>
          <ValuesEditor values={preset.values} onChange={(values) => setPreset({ ...preset, values })} entries={entries} />
          <Button
            variant="secondary"
            disabled={!preset.name || !Object.keys(preset.values).length}
            loading={a.busy === 'preset'}
            onClick={() =>
              void a.run('preset', () => api.post('features/presets', preset), 'Preset created.').then((ok) => {
                if (ok) setPreset({ name: '', description: '', values: {} });
                presets.reload();
              })
            }
          >
            <Save className="h-4 w-4" /> {t('Save the preset')}
          </Button>
        </div>
      </Card>
    </>
  );
}

// Anti-cheat

interface Flag {
  id: number;
  uid: string;
  name: string;
  publicId: string | null;
  kind: string;
  severity: number;
  details: string;
  createdAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
  resolution: string | null;
}

export function AntiCheatPage() {
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const { data, error, reload } = useLoad<{ settings: { enabled: boolean; levelJump: number; levelsPerHour: number; itemStack: number; money: number }; flags: Flag[] }>(
    `features/anticheat?status=${tab}`,
  );
  const [s, setS] = useState<NonNullable<typeof data>['settings'] | null>(null);
  const a = useAction();
  useEffect(() => {
    if (data && !s) setS(data.settings);
  }, [data, s]);
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data || !s) return <Spinner />;

  const resolve = (f: Flag, action: 'ignore' | 'kick' | 'ban') => {
    if (action !== 'ignore' && !window.confirm(action === 'ban' ? t('Ban {name}?', { name: f.name }) : t('Kick {name}?', { name: f.name }))) return;
    void a.run(`${action}${f.id}`, () => api.post(`features/anticheat/flags/${f.id}/resolve`, { action }), 'Alert handled.').then(reload);
  };

  return (
    <>
      <PageHeader
        title={t('Anti-cheat')}
        description={t('Automatic detection of levelling that is too fast and of abnormal item amounts (duplication).')}
        actions={
          <Button variant="secondary" loading={a.busy === 'scan'} onClick={() => void a.run('scan', async () => a.setMsg({ kind: 'success', text: t('{n} anomaly(ies) found.', { n: (await api.post<{ found: number }>('features/anticheat/scan')).found }) })).then(reload)}>
            <Search className="h-4 w-4" /> {t('Scan the world')}
          </Button>
        }
      />
      <Message msg={a.msg} />
      <Alert kind="info" className="mb-4">
        {t('These are suspicions, not proof: always check before punishing. A full anti-cheat (items, teleporting…) needs PalDefender, only available on Windows servers.')}
      </Alert>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card
          title={t('Alerts')}
          actions={
            <div className="flex gap-1">
              {(['open', 'resolved'] as const).map((tb) => (
                <button key={tb} onClick={() => setTab(tb)} className={cx('rounded-lg px-2.5 py-1 text-xs font-medium', tab === tb ? 'bg-accent text-accent-fg' : 'ring-1 ring-slate-200 dark:ring-slate-800')}>
                  {tb === 'open' ? t('To handle') : t('Handled')}
                </button>
              ))}
            </div>
          }
        >
          {data.flags.length === 0 ? (
            <Empty>{tab === 'open' ? t('Nothing suspicious so far.') : t('No handled alert.')}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.flags.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      {f.publicId ? <Link to={`/admin/server/world/${f.publicId}`} className="hover:text-accent">{f.name}</Link> : f.name}
                      <Badge tone={f.severity >= 3 ? 'red' : 'amber'}>{f.kind.startsWith('items') ? t('Items') : t('Level')}</Badge>
                    </p>
                    <p className="text-sm">{tm(f.details)}</p>
                    <p className="text-xs text-slate-500">
                      {format.formatDateTime(f.createdAt)}
                      {f.resolvedAt && ` · ${tm(f.resolution ?? '')} ${t('by {name}', { name: f.resolvedBy ?? '' })}`}
                    </p>
                  </div>
                  {!f.resolvedAt && (
                    <div className="flex gap-1">
                      <Button variant="ghost" onClick={() => resolve(f, 'ignore')}>
                        {t('Ignore')}
                      </Button>
                      <Button variant="secondary" loading={a.busy === `kick${f.id}`} onClick={() => resolve(f, 'kick')}>
                        <UserX className="h-4 w-4" />
                      </Button>
                      <Button variant="danger" loading={a.busy === `ban${f.id}`} onClick={() => resolve(f, 'ban')}>
                        <Gavel className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('Thresholds')} className="h-fit">
          <div className="space-y-3">
            <Toggle checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} label={t('Detection on')} />
            <Field label={t('Levels gained in 5 min')}>{(id) => <Input id={id} type="number" value={s.levelJump} onChange={(e) => setS({ ...s, levelJump: Number(e.target.value) })} />}</Field>
            <Field label={t('Levels gained in 1 h')}>{(id) => <Input id={id} type="number" value={s.levelsPerHour} onChange={(e) => setS({ ...s, levelsPerHour: Number(e.target.value) })} />}</Field>
            <Field label={t('Max amount of one item')}>{(id) => <Input id={id} type="number" value={s.itemStack} onChange={(e) => setS({ ...s, itemStack: Number(e.target.value) })} />}</Field>
            <Field label={t('Max gold coins')}>{(id) => <Input id={id} type="number" value={s.money} onChange={(e) => setS({ ...s, money: Number(e.target.value) })} />}</Field>
            <Button variant="secondary" loading={a.busy === 's'} onClick={() => void a.run('s', () => api.put('features/anticheat/settings', s), 'Thresholds saved.')}>
              {t('Save')}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

// Sanctions

interface SanctionData {
  name: string;
  ban: { reason: string; bannedAt: number; bannedBy: string; expiresAt: number | null } | null;
  history: { id: number; type: string; reason: string; expiresAt: number | null; createdAt: number; createdBy: string | null }[];
  warnings: number;
  flags: { id: number; kind: string; details: string; createdAt: number; resolution: string | null }[];
}

const SANCTION_LABELS: Record<string, { label: string; tone: 'amber' | 'red' | 'slate' | 'blue' | 'green' }> = {
  warning: { label: 'Warning', tone: 'amber' },
  note: { label: 'Note', tone: 'blue' },
  kick: { label: 'Kick|noun', tone: 'slate' },
  ban: { label: 'Ban|noun', tone: 'red' },
  tempban: { label: 'Temporary ban', tone: 'red' },
  unban: { label: 'Unban|noun', tone: 'green' },
};

export function SanctionsPage() {
  const players = useLoad<{ history: { uid: string; name: string; level: number; online: number }[] }>('admin/server/players');
  // "joueur": parameter name before 1.1.0.
  const [uid, setUid] = useState<string | null>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('player') ?? params.get('joueur');
  });
  const [filter, setFilter] = useState('');
  const detail = useLoad<SanctionData>(uid ? `features/sanctions/${encodeURIComponent(uid)}` : null);
  const [warn, setWarn] = useState({ reason: '', announce: false, kick: false });
  const [note, setNote] = useState('');
  const [ban, setBan] = useState({ reason: '', hours: 24 });
  const a = useAction();
  const enc = uid ? encodeURIComponent(uid) : '';

  return (
    <>
      <PageHeader title={t('Sanctions')} description={t('Warnings, private notes, temporary bans and history of each player.')} />
      <Message msg={a.msg} />
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card title={t('Players')} className="h-fit">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Filter…')} className="mb-2" />
          {!players.data ? (
            <Spinner />
          ) : (
            <ul className="max-h-[520px] overflow-y-auto">
              {players.data.history
                .filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
                .map((p) => (
                  <li key={p.uid}>
                    <button onClick={() => setUid(p.uid)} className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', uid === p.uid ? 'bg-accent/10 text-accent' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>
                      <span className={cx('h-2 w-2 rounded-full', p.online ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700')} />
                      <span className="flex-1 truncate font-medium">{p.name}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Card>
        {!uid ? (
          <Empty>{t('Pick a player in the list.')}</Empty>
        ) : !detail.data ? (
          <Spinner />
        ) : (
          <div className="space-y-6">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold">{detail.data.name}</h2>
                {detail.data.warnings > 0 && <Badge tone="amber">{t('{n} warning(s)', { n: detail.data.warnings })}</Badge>}
                {detail.data.ban && (
                  <Badge tone="red">
                    {detail.data.ban.expiresAt ? t('Banned until {date}', { date: format.formatDateTime(detail.data.ban.expiresAt) }) : t('Banned for good')}
                  </Badge>
                )}
              </div>
            </Card>
            <div className="grid gap-6 md:grid-cols-3">
              <Card title={t('Warn')}>
                <div className="space-y-2">
                  <Textarea rows={2} value={warn.reason} onChange={(e) => setWarn({ ...warn, reason: e.target.value })} placeholder={t('Reason')} />
                  <Toggle checked={warn.announce} onChange={(v) => setWarn({ ...warn, announce: v })} label={t('Announce in game')} description={t('Visible to every online player.')} />
                  <Toggle checked={warn.kick} onChange={(v) => setWarn({ ...warn, kick: v })} label={t('Kick as well')} />
                  <Button variant="secondary" disabled={!warn.reason} loading={a.busy === 'warn'} onClick={() => void a.run('warn', () => api.post(`features/sanctions/${enc}/warn`, warn), 'Warning recorded.').then(() => { setWarn({ reason: '', announce: false, kick: false }); detail.reload(); })}>
                    <AlertTriangle className="h-4 w-4" /> {t('Warn')}
                  </Button>
                </div>
              </Card>
              <Card title={t('Temporary ban')}>
                <div className="space-y-2">
                  <Input value={ban.reason} onChange={(e) => setBan({ ...ban, reason: e.target.value })} placeholder={t('Reason')} />
                  <Select value={ban.hours} onChange={(e) => setBan({ ...ban, hours: Number(e.target.value) })}>
                    {[1, 6, 24, 72, 168, 720].map((h) => (
                      <option key={h} value={h}>
                        {h < 24 ? `${h} h` : h === 24 ? t('1 day') : t('{n} days', { n: h / 24 })}
                      </option>
                    ))}
                  </Select>
                  <Button variant="danger" loading={a.busy === 'ban'} onClick={() => void a.run('ban', () => api.post(`features/sanctions/${enc}/tempban`, ban), 'Player banned temporarily.').then(detail.reload)}>
                    <Gavel className="h-4 w-4" /> {t('Ban')}
                  </Button>
                  {detail.data.ban && (
                    <Button variant="secondary" onClick={() => void a.run('unban', () => api.del(`features/bans/${enc}`), 'Player unbanned.').then(detail.reload)}>
                      {t('Unban')}
                    </Button>
                  )}
                </div>
              </Card>
              <Card title={t('Private note')}>
                <div className="space-y-2">
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Only visible to the team')} />
                  <Button variant="secondary" disabled={!note} loading={a.busy === 'note'} onClick={() => void a.run('note', () => api.post(`features/sanctions/${enc}/note`, { text: note })).then(() => { setNote(''); detail.reload(); })}>
                    <StickyNote className="h-4 w-4" /> {t('Add')}
                  </Button>
                </div>
              </Card>
            </div>
            <Card title={t('History')}>
              {detail.data.history.length === 0 ? (
                <Empty>{t('No sanction or note.')}</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.data.history.map((h) => (
                    <li key={h.id} className="flex items-start gap-3 py-2 text-sm">
                      <Badge tone={SANCTION_LABELS[h.type]?.tone ?? 'slate'}>{SANCTION_LABELS[h.type] ? t(SANCTION_LABELS[h.type].label) : h.type}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-line">{h.reason ? tm(h.reason) : '—'}</p>
                        <p className="text-xs text-slate-500">
                          {format.formatDateTime(h.createdAt)} · {h.createdBy ?? t('automatic')}
                          {h.expiresAt && ` · ${t('until {date}', { date: format.formatDateTime(h.expiresAt) })}`}
                        </p>
                      </div>
                      {(h.type === 'warning' || h.type === 'note') && (
                        <button onClick={() => void a.run(`rm${h.id}`, () => api.del(`features/sanctions/entry/${h.id}`)).then(detail.reload)} className="p-1 text-slate-400 hover:text-red-500" aria-label={t('Remove')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

// Reports and suggestions

interface Ticket {
  id: number;
  kind: 'report' | 'suggestion';
  subject: string;
  message: string;
  target: string | null;
  status: 'open' | 'answered' | 'closed';
  reply: string | null;
  repliedBy: string | null;
  createdAt: number;
  username: string;
}

export function TicketsAdminPage() {
  const [tab, setTab] = useState<'open' | 'closed' | 'all'>('open');
  const { data, error, reload } = useLoad<{ open: number; items: Ticket[] }>(`features/tickets?status=${tab}`);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const a = useAction();
  if (error) return <Alert kind="error">{error}</Alert>;
  return (
    <>
      <PageHeader title={t('Reports and suggestions')} description={t('Messages sent by players from the site.')} />
      <Message msg={a.msg} />
      <div className="mb-4 flex gap-2">
        {(
          [
            ['open', data?.open ? `${t('To handle')} (${data.open})` : t('To handle')],
            ['closed', t('Handled')],
            ['all', t('All')],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg px-3 py-1.5 text-sm font-medium', tab === k ? 'bg-accent text-accent-fg' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800')}>
            {label}
          </button>
        ))}
      </div>
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty>{t('No message.')}</Empty>
      ) : (
        <div className="space-y-4">
          {data.items.map((tk) => (
            <Card key={tk.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {tk.kind === 'report' ? `🚩 ${t('Report|noun')}` : `💡 ${t('Suggestion')}`} · {tk.subject}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t('by')} <strong>{tk.username}</strong> · {format.formatDateTime(tk.createdAt)}
                    {tk.target && ` · ${t('about {target}', { target: tk.target })}`}
                  </p>
                </div>
                <Badge tone={tk.status === 'open' ? 'amber' : tk.status === 'answered' ? 'green' : 'slate'}>
                  {{ open: t('To handle'), answered: t('Answered|admin'), closed: t('Closed|admin') }[tk.status]}
                </Badge>
              </div>
              <p className="mt-3 text-sm whitespace-pre-line">{tk.message}</p>
              {tk.reply && (
                <div className="mt-3 rounded-lg bg-accent/10 p-3 text-sm">
                  <p className="text-xs font-semibold text-accent">{t('Answer from {name}', { name: tk.repliedBy ?? '' })}</p>
                  <p className="whitespace-pre-line">{tk.reply}</p>
                </div>
              )}
              {tk.status !== 'closed' && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    rows={2}
                    value={replies[tk.id] ?? ''}
                    onChange={(e) => setReplies({ ...replies, [tk.id]: e.target.value })}
                    placeholder={t('Answer the player (visible on their profile)')}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={!replies[tk.id]}
                      loading={a.busy === `r${tk.id}`}
                      onClick={() => void a.run(`r${tk.id}`, () => api.post(`features/tickets/${tk.id}/reply`, { reply: replies[tk.id] }), 'Answer sent.').then(reload)}
                    >
                      {t('Answer')}
                    </Button>
                    <Button
                      variant="ghost"
                      loading={a.busy === `c${tk.id}`}
                      onClick={() =>
                        void a.run(`c${tk.id}`, () => api.post(`features/tickets/${tk.id}/reply`, { reply: replies[tk.id] ?? '', close: true }), 'Request closed.').then(reload)
                      }
                    >
                      <Check className="h-4 w-4" /> {replies[tk.id] ? t('Answer and close') : t('Close')}
                    </Button>
                  </div>
                </div>
              )}
              <div className="mt-2 text-right">
                <button
                  className="text-xs text-slate-400 hover:text-red-500"
                  onClick={() => window.confirm(t('Delete this message?')) && void a.run(`d${tk.id}`, () => api.del(`features/tickets/${tk.id}`)).then(reload)}
                >
                  {t('Delete')}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// Updates

export function UpdatesPage() {
  const { boot } = useApp();
  const perms = new Set(boot.user?.permissions);
  const server = useLoad<{
    settings: { auto: boolean; checkMinutes: number; warnings: number[] };
    installed: string | null;
    latest: string | null;
    outdated: boolean;
    checkedAt: number | null;
    error: string | null;
    pending: { at: number } | null;
    running: boolean;
    lastResult: string | null;
  }>(perms.has('server.schedules') && boot.serverMode === 'managed' ? 'features/updates/server' : null);
  const palcms = useLoad<{ current: string; latest: string | null; available: boolean; notes: string; url: string; checkedAt: number | null; error: string | null; canInstall: boolean }>(
    perms.has('admin.updates') ? 'features/updates/palcms' : null,
  );
  const [ss, setSs] = useState<{ auto: boolean; checkMinutes: number; warnings: number[] } | null>(null);
  const [delay, setDelay] = useState(15);
  const a = useAction();
  useEffect(() => {
    if (server.data && !ss) setSs(server.data.settings);
  }, [server.data, ss]);

  return (
    <>
      <PageHeader title={t('Updates')} description={t('Palworld server and PalCMS.')} />
      <Message msg={a.msg} />
      <div className="grid gap-6 lg:grid-cols-2">
        {perms.has('admin.updates') && (
          <Card title="PalCMS">
            {!palcms.data ? (
              <Spinner />
            ) : (
              <div className="space-y-3">
                <p className="text-sm">
                  {t('Installed version:')} <strong>{palcms.data.current}</strong>
                  {palcms.data.latest && (
                    <>
                      {' '}
                      · {t('latest version:')} <strong>{palcms.data.latest}</strong>
                    </>
                  )}
                </p>
                {palcms.data.error && <Alert kind="warning">{t('Check failed: {error}', { error: tm(palcms.data.error) })}</Alert>}
                {palcms.data.available ? (
                  <>
                    <Alert kind="success">{t('A new version is available!')}</Alert>
                    {palcms.data.notes && <pre className="max-h-64 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:bg-slate-800">{palcms.data.notes}</pre>}
                    <Button
                      loading={a.busy === 'palcms'}
                      disabled={!palcms.data.canInstall}
                      onClick={() => {
                        if (window.confirm(t('Install PalCMS {version}?\n\nThe site will be down for about a minute. Your data is kept.', { version: palcms.data!.latest }))) {
                          void a.run('palcms', () => api.post('features/updates/palcms/install'), 'Update started. Reload the page in a minute.');
                        }
                      }}
                    >
                      <Download className="h-4 w-4" /> {t('Install {version}', { version: palcms.data.latest })}
                    </Button>
                  </>
                ) : (
                  !palcms.data.error && palcms.data.latest && <Alert kind="info">{t('PalCMS is up to date.')}</Alert>
                )}
                <p className="text-xs text-slate-500">
                  {t('Checked {when}', { when: palcms.data.checkedAt ? format.timeAgo(palcms.data.checkedAt) : t('never') })} ·{' '}
                  <button className="text-accent" onClick={() => void a.run('check', () => api.post('features/updates/palcms/check')).then(palcms.reload)}>
                    {t('check now')}
                  </button>
                </p>
              </div>
            )}
          </Card>
        )}
        {perms.has('server.schedules') && boot.serverMode === 'managed' && (
          <Card title={t('Palworld server')}>
            {!server.data || !ss ? (
              <Spinner />
            ) : (
              <div className="space-y-4">
                <p className="text-sm">
                  {t('Installed build:')} <strong>{server.data.installed ?? '—'}</strong> · {t('online:')} <strong>{server.data.latest ?? '—'}</strong>
                </p>
                {server.data.error && <Alert kind="warning">{tm(server.data.error)}</Alert>}
                {server.data.running ? (
                  <Alert kind="info">{t('Update in progress…')}</Alert>
                ) : server.data.pending ? (
                  <Alert kind="info">
                    {t('Update planned {date}.', { date: format.formatDateTime(server.data.pending.at) })}{' '}
                    <button className="font-semibold underline" onClick={() => void a.run('cancel', () => api.del('features/updates/server/pending'), 'Update cancelled.').then(server.reload)}>
                      {t('Cancel')}
                    </button>
                  </Alert>
                ) : server.data.outdated ? (
                  <Alert kind="warning">{t('A new Palworld server version is available.')}</Alert>
                ) : (
                  server.data.latest && <Alert kind="success">{t('The server is up to date.')}</Alert>
                )}
                {server.data.lastResult && <p className="text-xs text-slate-500">{tm(server.data.lastResult)}</p>}
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={t('In')}>
                    {(id) => (
                      <Select id={id} value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
                        {[0, 5, 15, 30].map((m) => (
                          <option key={m} value={m}>
                            {m ? `${m} min` : t('Right now')}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Button variant="secondary" loading={a.busy === 'now'} disabled={server.data.running || !!server.data.pending} onClick={() => void a.run('now', () => api.post('features/updates/server/now', { delayMinutes: delay }), 'Update scheduled.').then(server.reload)}>
                    {t('Update')}
                  </Button>
                  <Button variant="ghost" loading={a.busy === 'scheck'} onClick={() => void a.run('scheck', () => api.post('features/updates/server/check')).then(server.reload)}>
                    <RefreshCw className="h-4 w-4" /> {t('Check')}
                  </Button>
                </div>
                <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <Toggle checked={ss.auto} onChange={(v) => setSs({ ...ss, auto: v })} label={t('Automatic update')} description={t('As soon as a new version is out: in-game announcements, backup, update and restart.')} />
                  <Field label={t('Check every')}>
                    {(id) => (
                      <Select id={id} value={ss.checkMinutes} onChange={(e) => setSs({ ...ss, checkMinutes: Number(e.target.value) })}>
                        {[10, 30, 60, 180, 360].map((m) => (
                          <option key={m} value={m}>
                            {m < 60 ? `${m} min` : `${m / 60} h`}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Button variant="secondary" loading={a.busy === 'ss'} onClick={() => void a.run('ss', () => api.put('features/updates/server/settings', ss), 'Settings saved.')}>
                    {t('Save')}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
