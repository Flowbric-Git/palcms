import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Globe,
  KeyRound,
  Loader2,
  PartyPopper,
  PlugZap,
  RotateCcw,
  Server,
  ServerCog,
  UserCog,
  Palette,
  XCircle,
} from 'lucide-react';
import { LANGS, type Lang, type PalworldSetup, type ServerMode, type SetupState, type SetupStep, type TaskState } from '@palcms/shared';
import { api, ApiError, basePath, errorText } from '../lib/api';
import { useApp } from '../lib/app';
import { useRealtime, realtime } from '../lib/ws';
import { lang, t, tm } from '../lib/i18n';
import { Alert, Badge, Button, Field, Input, Select, Spinner, Toggle, cx } from '../components/ui';
import { ImageField } from '../components/ImageField';
import { ExternalServerForm } from '../components/ExternalServerForm';
import { LanguageSwitch } from '../components/LanguageSwitch';

type StepInfo = { id: SetupStep; label: string; Icon: typeof KeyRound };

/** Wizard steps, which depend on the first choice (install, connect or website only). */
function stepsFor(mode: ServerMode | null): StepInfo[] {
  const server: StepInfo[] =
    mode === 'external'
      ? [{ id: 'external', label: 'Server connection', Icon: PlugZap }]
      : mode === 'none'
        ? []
        : [
            { id: 'server', label: 'Palworld server', Icon: Server },
            { id: 'install', label: 'Installation', Icon: Loader2 },
          ];
  return [
    { id: 'token', label: 'Setup token', Icon: KeyRound },
    { id: 'mode', label: 'Server choice', Icon: ServerCog },
    ...server,
    { id: 'admin', label: 'Administrator account', Icon: UserCog },
    { id: 'site', label: 'Your website', Icon: Palette },
    { id: 'finish', label: 'Done', Icon: PartyPopper },
  ];
}

function Shell({ step, mode, children }: { step: SetupStep; mode: ServerMode | null; children: ReactNode }) {
  const STEPS = stepsFor(mode);
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[240px_1fr]">
        <aside>
          <div className="mb-8 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-lg font-bold">
              <span className="text-2xl">🐾</span> PalCMS
            </span>
            <LanguageSwitch />
          </div>
          <ol className="space-y-1">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                className={cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                  i === current && 'bg-white font-semibold shadow-sm dark:bg-slate-800',
                  i > current && 'text-slate-400',
                )}
              >
                {i < current ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <s.Icon className="h-4 w-4" />}
                {t(s.label)}
              </li>
            ))}
          </ol>
        </aside>
        <main className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-8 dark:bg-slate-900 dark:ring-slate-800">{children}</main>
      </div>
    </div>
  );
}

function StepTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children && <p className="mt-2 text-sm text-slate-500">{children}</p>}
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  const field = (name: string) => (error instanceof ApiError ? error.field(name) : undefined);
  return { busy, error, run, field };
}

// Steps

function TokenStep({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('');
  const s = useSubmit();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void s.run(async () => {
      await api.post('setup/token', { token });
      realtime.reconnect();
      onDone();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <StepTitle title={t('Welcome!')}>
        {t('To secure the setup, paste the token shown in your VPS terminal at the end of the install script. You can also find it with this command:')}{' '}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">sudo cat /var/lib/palcms/setup-token</code>
      </StepTitle>
      <Field label={t('Setup token')}>
        {(id) => <Input id={id} value={token} onChange={(e) => setToken(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoFocus className="font-mono" />}
      </Field>
      {s.error && <Alert kind="error">{s.error.message}</Alert>}
      <Button type="submit" loading={s.busy} disabled={token.trim().length < 8}>
        {t('Continue')}
      </Button>
    </form>
  );
}

function ModeStep({ current, onDone }: { current: ServerMode | null; onDone: () => void }) {
  const [busy, setBusy] = useState<ServerMode | null>(null);
  const [error, setError] = useState('');
  const choose = async (mode: ServerMode) => {
    setBusy(mode);
    setError('');
    try {
      await api.post('setup/mode', { mode });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const option = (mode: ServerMode, Icon: typeof Server, title: string, text: string, badge?: string) => (
    <button
      type="button"
      onClick={() => void choose(mode)}
      disabled={busy !== null}
      className={cx(
        'flex w-full items-start gap-4 rounded-xl p-5 text-left ring-2 transition hover:ring-accent disabled:opacity-60',
        current === mode ? 'bg-accent/5 ring-accent' : 'ring-slate-200 dark:ring-slate-700',
      )}
    >
      {busy === mode ? <Loader2 className="mt-1 h-6 w-6 shrink-0 animate-spin text-accent" /> : <Icon className="mt-1 h-6 w-6 shrink-0 text-accent" />}
      <span>
        <span className="flex flex-wrap items-center gap-2 text-base font-semibold">
          {title} {badge && <Badge tone="accent">{badge}</Badge>}
        </span>
        <span className="mt-1 block text-sm text-slate-500">{text}</span>
      </span>
    </button>
  );
  return (
    <div className="space-y-4">
      <StepTitle title={t('Your Palworld server')}>{t('What do you want to do? You can connect another server later from the admin panel.')}</StepTitle>
      {option(
        'managed',
        Server,
        t('Install a new Palworld server'),
        t('PalCMS installs SteamCMD and the dedicated server on this VPS, then runs it fully: start, configuration, backups, updates…'),
        t('Recommended'),
      )}
      {option(
        'external',
        PlugZap,
        t('Connect an existing server'),
        t(
          'You already have a Palworld server (on this VPS or elsewhere): the site connects to it through its REST API. Status, players, map, leaderboard, moderation and announcements work; running the machine (start, configuration, backups) stays on your side.',
        ),
      )}
      {option('none', Globe, t('Only the website, for now'), t('No server for now. You will connect one later in Admin panel > Server connection.'))}
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}

function ExternalStep({ initial, onDone }: { initial: SetupState['externalForm']; onDone: () => void }) {
  return (
    <div className="space-y-5">
      <StepTitle title={t('Connect your existing server')}>{t('PalCMS connects to the official REST API of the dedicated server. Test the connection before going on.')}</StepTitle>
      <ExternalServerForm
        initial={initial}
        testPath="setup/connection/test"
        submitLabel={t('Save and continue')}
        onSave={async (value) => {
          await api.post('setup/external', value);
          onDone();
        }}
      />
    </div>
  );
}

const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 55]).join('');

const DEFAULT_SERVER: PalworldSetup = {
  serverName: 'My Palworld server',
  description: '',
  serverPassword: '',
  adminPassword: '',
  maxPlayers: 16,
  port: 8211,
  restApiPort: 8212,
  difficulty: 'None',
  expRate: 1,
  palCaptureRate: 1,
  collectionDropRate: 1,
  enemyDropItemRate: 1,
  deathPenalty: 'All',
  pvp: false,
};

function ServerStep({ initial, onDone }: { initial: Record<string, unknown> | null; onDone: () => void }) {
  const [form, setForm] = useState<PalworldSetup>(() => ({
    ...DEFAULT_SERVER,
    serverName: t('My Palworld server'),
    adminPassword: randomPassword(),
    ...(initial as Partial<PalworldSetup> | null),
  }));
  const s = useSubmit();
  const set = <K extends keyof PalworldSetup>(k: K, v: PalworldSetup[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: keyof PalworldSetup) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void s.run(async () => {
      await api.post('setup/server', form);
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <StepTitle title={t('Your Palworld server')}>{t('These settings are written to PalWorldSettings.ini. Everything can be changed later from the admin panel.')}</StepTitle>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('Server name')} error={s.field('serverName')} className="md:col-span-2">
          {(id) => <Input id={id} value={form.serverName} onChange={(e) => set('serverName', e.target.value)} required />}
        </Field>
        <Field label={t('Description')} error={s.field('description')} className="md:col-span-2">
          {(id) => <Input id={id} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <Field label={t('Server password')} help={t('Leave empty for a server open to everyone')} error={s.field('serverPassword')}>
          {(id) => <Input id={id} value={form.serverPassword} onChange={(e) => set('serverPassword', e.target.value)} />}
        </Field>
        <Field label={t('Admin password')} help={t('For admin commands in game and for the CMS')} error={s.field('adminPassword')}>
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} className="font-mono" required />
              <Button type="button" variant="secondary" onClick={() => set('adminPassword', randomPassword())} title={t('Generate')}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Field>
        <Field label={t('Max players')} error={s.field('maxPlayers')}>
          {(id) => <Input id={id} type="number" min={1} max={32} value={form.maxPlayers} onChange={num('maxPlayers')} />}
        </Field>
        <Field label={t('Difficulty')} error={s.field('difficulty')}>
          {(id) => (
            <Select id={id} value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as PalworldSetup['difficulty'])}>
              <option value="None">{t('Custom (settings below)')}</option>
              <option value="Casual">{t('Easy')}</option>
              <option value="Normal">{t('Normal')}</option>
              <option value="Hard">{t('Hard')}</option>
            </Select>
          )}
        </Field>
      </div>

      <details className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/40">
        <summary className="cursor-pointer text-sm font-semibold">{t('Gameplay settings')}</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label={t('Experience rate')} error={s.field('expRate')}>
            {(id) => <Input id={id} type="number" step="0.1" min={0.1} max={20} value={form.expRate} onChange={num('expRate')} />}
          </Field>
          <Field label={t('Capture rate')} error={s.field('palCaptureRate')}>
            {(id) => <Input id={id} type="number" step="0.1" min={0.5} max={2} value={form.palCaptureRate} onChange={num('palCaptureRate')} />}
          </Field>
          <Field label={t('Gathering rate')} error={s.field('collectionDropRate')}>
            {(id) => <Input id={id} type="number" step="0.1" min={0.5} max={3} value={form.collectionDropRate} onChange={num('collectionDropRate')} />}
          </Field>
          <Field label={t('Enemy loot rate')} error={s.field('enemyDropItemRate')}>
            {(id) => <Input id={id} type="number" step="0.1" min={0.5} max={3} value={form.enemyDropItemRate} onChange={num('enemyDropItemRate')} />}
          </Field>
          <Field label={t('Death penalty')}>
            {(id) => (
              <Select id={id} value={form.deathPenalty} onChange={(e) => set('deathPenalty', e.target.value as PalworldSetup['deathPenalty'])}>
                <option value="None">{t('None')}</option>
                <option value="Item">{t('Items')}</option>
                <option value="ItemAndEquipment">{t('Items and equipment')}</option>
                <option value="All">{t('Everything (Pals included)')}</option>
              </Select>
            )}
          </Field>
          <div className="flex items-end pb-2">
            <Toggle checked={form.pvp} onChange={(v) => set('pvp', v)} label="PvP" description={t('Player to player damage')} />
          </div>
        </div>
      </details>

      <details className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/40">
        <summary className="cursor-pointer text-sm font-semibold">{t('Network (advanced)')}</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label={t('Game port (UDP)')} help={t('Opened automatically in the firewall')} error={s.field('port')}>
            {(id) => <Input id={id} type="number" value={form.port} onChange={num('port')} />}
          </Field>
          <Field label={t('REST API port')} help={t('Local only, never exposed to the Internet')} error={s.field('restApiPort')}>
            {(id) => <Input id={id} type="number" value={form.restApiPort} onChange={num('restApiPort')} />}
          </Field>
        </div>
      </details>

      {s.error && !(s.error instanceof ApiError && s.error.details) && <Alert kind="error">{s.error.message}</Alert>}
      {s.error instanceof ApiError && s.error.details && <Alert kind="error">{t('Check the fields in red.')}</Alert>}
      <Button type="submit" loading={s.busy}>
        {t('Save and go to the installation')}
      </Button>
    </form>
  );
}

function TaskIcon({ status }: { status: TaskState['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === 'running') return <Loader2 className="h-5 w-5 animate-spin text-accent" />;
  if (status === 'failed') return <XCircle className="h-5 w-5 text-red-500" />;
  return <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />;
}

function InstallStep({ state, onChange, onEditServer }: { state: SetupState; onChange: () => Promise<void> | void; onEditServer: () => void }) {
  const [tasks, setTasks] = useState<TaskState[]>(state.tasks);
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => setTasks(state.tasks), [state.tasks]);

  useRealtime('setup', (msg) => {
    if (msg.type === 'task') {
      setTasks((ts) => ts.map((x) => (x.id === msg.data.id ? msg.data : x)));
      if (msg.data.status === 'running') {
        setSelected(msg.data.id);
        setLogs((l) => ({ ...l, [msg.data.id]: [] }));
      }
      if (msg.data.status !== 'running') setTimeout(() => void onChange(), 400);
    } else if (msg.type === 'task-log') {
      setLogs((l) => ({ ...l, [msg.data.id]: [...(l[msg.data.id] ?? []), msg.data.line].slice(-500) }));
    }
  });

  const running = tasks.find((x) => x.status === 'running');
  const failed = tasks.find((x) => x.status === 'failed');
  const started = tasks.some((x) => x.status !== 'pending');
  const shown = selected ?? running?.id ?? failed?.id ?? null;

  // Reloads the log of a past step (after a page refresh).
  useEffect(() => {
    if (!shown || logs[shown]) return;
    api
      .get<{ log: string }>(`setup/logs/${shown}`)
      .then((r) => setLogs((l) => ({ ...l, [shown]: r.log.split('\n').filter(Boolean) })))
      .catch(() => {});
  }, [shown, logs]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs, shown]);

  // Safety net when the WebSocket drops: read the state again every 3 seconds.
  useEffect(() => {
    if (!state.installing && !running) return;
    const timer = setInterval(() => void onChange(), 3000);
    return () => clearInterval(timer);
  }, [state.installing, running, onChange]);

  const start = async () => {
    setError('');
    try {
      await api.post('setup/install');
      void onChange();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="space-y-5">
      <StepTitle title={t('Server installation')}>
        {t('SteamCMD, then the Palworld dedicated server (several GB), are downloaded to your VPS. Depending on the connection, this takes 2 to 15 minutes. You can close this page: the installation keeps going.')}
      </StepTitle>
      <ol className="space-y-1">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => setSelected(task.id)}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                shown === task.id ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
              )}
            >
              <TaskIcon status={task.status} />
              <span className={cx('flex-1', task.status === 'pending' && 'text-slate-400')}>{t(task.label)}</span>
              {task.status === 'failed' && <Badge tone="red">{t('Failed')}</Badge>}
            </button>
          </li>
        ))}
      </ol>

      {shown && (
        <pre ref={logRef} className="h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200">
          {(logs[shown] ?? []).map(tm).join('\n') || t('Waiting…')}
        </pre>
      )}

      {failed && (
        <Alert kind="error">
          <p className="font-semibold">{t('The step "{step}" failed.', { step: t(failed.label) })}</p>
          <p className="mt-1">{failed.error ? tm(failed.error) : ''}</p>
        </Alert>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        {!started && <Button onClick={() => void start()}>{t('Start the installation')}</Button>}
        {failed && !running && (
          <>
            <Button onClick={() => void start()}>
              <RotateCcw className="h-4 w-4" /> {t('Retry')}
            </Button>
            <Button variant="secondary" onClick={onEditServer}>
              {t('Change the server settings')}
            </Button>
          </>
        )}
        {running && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('Installing…')}
          </p>
        )}
      </div>
    </div>
  );
}

function AdminStep({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const s = useSubmit();
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    void s.run(async () => {
      await api.post('setup/admin', { username: form.username, email: form.email, password: form.password });
      onDone();
    });
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={submit} className="space-y-5">
      <StepTitle title={t('Administrator account')}>{t('This is the main account of the admin panel: it runs the server and the site. Keep its login details safe.')}</StepTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('Username')} error={s.field('username')}>
          {(id) => <Input id={id} value={form.username} onChange={set('username')} autoComplete="username" required />}
        </Field>
        <Field label={t('Email')} error={s.field('email')}>
          {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} autoComplete="email" required />}
        </Field>
        <Field label={t('Password')} help={t('At least 8 characters')} error={s.field('password')}>
          {(id) => <Input id={id} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />}
        </Field>
        <Field label={t('Confirmation')} error={mismatch ? t('The passwords do not match') : undefined}>
          {(id) => <Input id={id} type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />}
        </Field>
      </div>
      {s.error && <Alert kind="error">{s.error.message}</Alert>}
      <Button type="submit" loading={s.busy} disabled={mismatch}>
        {t('Create the account')}
      </Button>
    </form>
  );
}

const PRESETS = ['#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#eab308', '#14b8a6', '#ef4444'];

function SiteStep({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    name: t('My Palworld server'),
    tagline: t('A community Palworld server'),
    accentColor: '#22c55e',
    defaultTheme: 'dark' as 'dark' | 'light' | 'system',
    language: lang() as Lang,
    discordUrl: '',
    logoUrl: '',
  });
  const s = useSubmit();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void s.run(async () => {
      await api.post('setup/site', form);
      onDone();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <StepTitle title={t('Your website')}>{t('The basics of the look. Everything can be customized later in "Website".')}</StepTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('Community name')} error={s.field('name')}>
          {(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} required />}
        </Field>
        <Field label={t('Tagline')} error={s.field('tagline')}>
          {(id) => <Input id={id} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />}
        </Field>
        <Field label={t('Site language')} help={t('For visitors, starter pages, Discord and in-game messages')}>
          {(id) => (
            <Select id={id} value={form.language} onChange={(e) => set('language', e.target.value as Lang)}>
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('Default theme')}>
          {(id) => (
            <Select id={id} value={form.defaultTheme} onChange={(e) => set('defaultTheme', e.target.value as typeof form.defaultTheme)}>
              <option value="dark">{t('Dark')}</option>
              <option value="light">{t('Light')}</option>
              <option value="system">{t("Follow the visitor's device")}</option>
            </Select>
          )}
        </Field>
        <Field label={t('Main color')} error={s.field('accentColor')} className="md:col-span-2">
          {() => (
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => set('accentColor', c)}
                  className={cx('h-8 w-8 rounded-full ring-2 ring-offset-2 dark:ring-offset-slate-900', form.accentColor === c ? 'ring-slate-900 dark:ring-white' : 'ring-transparent')}
                  style={{ background: c }}
                />
              ))}
              <input type="color" value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="h-8 w-10 cursor-pointer rounded bg-transparent" />
            </div>
          )}
        </Field>
        <Field label={t('Discord invite link')} help={t('Optional')} error={s.field('discordUrl')} className="md:col-span-2">
          {(id) => <Input id={id} value={form.discordUrl} onChange={(e) => set('discordUrl', e.target.value)} placeholder="https://discord.gg/…" />}
        </Field>
        <Field label={t('Logo')} help={t('Optional: PNG, JPG, GIF or WebP')} className="md:col-span-2">
          {() => <ImageField value={form.logoUrl} onChange={(v) => set('logoUrl', v)} uploadPath="setup/upload" />}
        </Field>
      </div>
      {s.error && <Alert kind="error">{s.error.message}</Alert>}
      <Button type="submit" loading={s.busy}>
        {t('Continue')}
      </Button>
    </form>
  );
}

function FinishStep({ mode }: { mode: ServerMode | null }) {
  const { refresh } = useApp();
  const s = useSubmit();
  const finish = () =>
    void s.run(async () => {
      await api.post('setup/finish');
      await refresh();
      window.location.replace(basePath);
    });
  return (
    <div className="space-y-5 text-center">
      <PartyPopper className="mx-auto h-14 w-14 text-accent" />
      <StepTitle title={t('All set!')}>
        {mode === 'managed'
          ? t('The Palworld server is running and your administrator account is created. All that is left is finishing the site: starter content, modules and automatic tasks.')
          : mode === 'external'
            ? t('Your server is connected and your administrator account is created. All that is left is finishing the site: starter content and modules.')
            : t('Your administrator account is created. The site will be ready in a moment; you can connect a server later in Admin panel > Server connection.')}
      </StepTitle>
      {s.error && <Alert kind="error">{s.error.message}</Alert>}
      <Button onClick={finish} loading={s.busy} className="mx-auto">
        {t('Install the CMS and open my site')}
      </Button>
    </div>
  );
}

// Wizard

export function SetupWizard() {
  const [state, setState] = useState<SetupState | null>(null);
  const [editServer, setEditServer] = useState(false);
  const [changeMode, setChangeMode] = useState(false);

  const load = useCallback(async () => {
    const s = await api.get<SetupState>('setup/state');
    setState(s);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return <Spinner />;
  if (state.done) {
    window.location.replace(basePath);
    return <Spinner />;
  }

  const step: SetupStep = changeMode ? 'mode' : editServer ? 'server' : state.step;
  const next = () => {
    setEditServer(false);
    setChangeMode(false);
    void load();
  };
  // The server choice can be changed until the installation has started.
  const canGoBack = !changeMode && (step === 'server' || step === 'external' || (step === 'install' && !state.tasks.some((x) => x.status !== 'pending')));

  return (
    <Shell step={step} mode={state.mode}>
      {canGoBack && (
        <button type="button" onClick={() => setChangeMode(true)} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent">
          <ArrowLeft className="h-4 w-4" /> {t('Change my choice')}
        </button>
      )}
      {step === 'token' && <TokenStep onDone={next} />}
      {step === 'mode' && <ModeStep current={state.mode} onDone={next} />}
      {step === 'external' && <ExternalStep initial={state.externalForm} onDone={next} />}
      {step === 'server' && <ServerStep initial={state.serverForm} onDone={next} />}
      {step === 'install' && <InstallStep state={state} onChange={load} onEditServer={() => setEditServer(true)} />}
      {step === 'admin' && <AdminStep onDone={next} />}
      {step === 'site' && <SiteStep onDone={next} />}
      {step === 'finish' && <FinishStep mode={state.mode} />}
    </Shell>
  );
}
