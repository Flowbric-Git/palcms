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
import type { PalworldSetup, ServerMode, SetupState, SetupStep, TaskState } from '@palcms/shared';
import { api, ApiError, basePath, errorText } from '../lib/api';
import { useApp } from '../lib/app';
import { useRealtime, realtime } from '../lib/ws';
import { Alert, Badge, Button, Field, Input, Select, Spinner, Toggle, cx } from '../components/ui';
import { ImageField } from '../components/ImageField';
import { ExternalServerForm } from '../components/ExternalServerForm';

type StepInfo = { id: SetupStep; label: string; Icon: typeof KeyRound };

/** Étapes de l'assistant, qui dépendent du choix fait au début (installer, connecter ou site seul). */
function stepsFor(mode: ServerMode | null): StepInfo[] {
  const server: StepInfo[] =
    mode === 'external'
      ? [{ id: 'external', label: 'Connexion au serveur', Icon: PlugZap }]
      : mode === 'none'
        ? []
        : [
            { id: 'server', label: 'Serveur Palworld', Icon: Server },
            { id: 'install', label: 'Installation', Icon: Loader2 },
          ];
  return [
    { id: 'token', label: "Jeton d'installation", Icon: KeyRound },
    { id: 'mode', label: 'Choix du serveur', Icon: ServerCog },
    ...server,
    { id: 'admin', label: 'Compte administrateur', Icon: UserCog },
    { id: 'site', label: 'Votre site', Icon: Palette },
    { id: 'finish', label: 'Terminé', Icon: PartyPopper },
  ];
}

function Shell({ step, mode, children }: { step: SetupStep; mode: ServerMode | null; children: ReactNode }) {
  const STEPS = stepsFor(mode);
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[240px_1fr]">
        <aside>
          <div className="mb-8 flex items-center gap-2 text-lg font-bold">
            <span className="text-2xl">🐾</span> PalCMS
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
                {s.label}
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

// Étapes

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
      <StepTitle title="Bienvenue !">
        Pour sécuriser l'installation, colle le jeton affiché dans le terminal de ton VPS à la fin du script d'installation. Tu peux aussi le
        retrouver avec la commande <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">sudo cat /var/lib/palcms/setup-token</code>.
      </StepTitle>
      <Field label="Jeton d'installation">
        {(id) => <Input id={id} value={token} onChange={(e) => setToken(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoFocus className="font-mono" />}
      </Field>
      {s.error && <Alert kind="error">{s.error.message}</Alert>}
      <Button type="submit" loading={s.busy} disabled={token.trim().length < 8}>
        Continuer
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
      <StepTitle title="Ton serveur Palworld">Que veux-tu faire ? Tu pourras connecter un autre serveur plus tard depuis le panel admin.</StepTitle>
      {option(
        'managed',
        Server,
        'Installer un nouveau serveur Palworld',
        'PalCMS installe SteamCMD et le serveur dédié sur ce VPS, puis le gère entièrement : démarrage, configuration, sauvegardes, mises à jour…',
        'Recommandé',
      )}
      {option(
        'external',
        PlugZap,
        'Connecter un serveur existant',
        'Tu as déjà un serveur Palworld (sur ce VPS ou ailleurs) : le site s’y connecte par son API REST. Statut, joueurs, carte, classement, modération et annonces fonctionnent ; la gestion de la machine (démarrage, configuration, sauvegardes) reste de ton côté.',
      )}
      {option(
        'none',
        Globe,
        'Uniquement le site, pour l’instant',
        'Aucun serveur pour le moment. Tu en connecteras un plus tard dans Panel admin > Connexion au serveur.',
      )}
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}

function ExternalStep({ initial, onDone }: { initial: SetupState['externalForm']; onDone: () => void }) {
  return (
    <div className="space-y-5">
      <StepTitle title="Connecter ton serveur existant">
        PalCMS se connecte à l’API REST officielle du serveur dédié. Teste la connexion avant de continuer.
      </StepTitle>
      <ExternalServerForm
        initial={initial}
        testPath="setup/connection/test"
        submitLabel="Enregistrer et continuer"
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
  serverName: 'Mon serveur Palworld',
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
      <StepTitle title="Ton serveur Palworld">Ces réglages seront écrits dans PalWorldSettings.ini. Tout reste modifiable ensuite depuis le panel admin.</StepTitle>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nom du serveur" error={s.field('serverName')} className="md:col-span-2">
          {(id) => <Input id={id} value={form.serverName} onChange={(e) => set('serverName', e.target.value)} required />}
        </Field>
        <Field label="Description" error={s.field('description')} className="md:col-span-2">
          {(id) => <Input id={id} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <Field label="Mot de passe du serveur" help="Laisse vide pour un serveur ouvert à tous" error={s.field('serverPassword')}>
          {(id) => <Input id={id} value={form.serverPassword} onChange={(e) => set('serverPassword', e.target.value)} />}
        </Field>
        <Field label="Mot de passe admin" help="Pour les commandes admin en jeu et pour le CMS" error={s.field('adminPassword')}>
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} className="font-mono" required />
              <Button type="button" variant="secondary" onClick={() => set('adminPassword', randomPassword())} title="Générer">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Field>
        <Field label="Joueurs maximum" error={s.field('maxPlayers')}>
          {(id) => <Input id={id} type="number" min={1} max={32} value={form.maxPlayers} onChange={num('maxPlayers')} />}
        </Field>
        <Field label="Difficulté" error={s.field('difficulty')}>
          {(id) => (
            <Select id={id} value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as PalworldSetup['difficulty'])}>
              <option value="None">Personnalisée (réglages ci-dessous)</option>
              <option value="Casual">Facile</option>
              <option value="Normal">Normale</option>
              <option value="Hard">Difficile</option>
            </Select>
          )}
        </Field>
      </div>

      <details className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/40">
        <summary className="cursor-pointer text-sm font-semibold">Réglages de jeu</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Taux d'expérience" error={s.field('expRate')}>
            {(id) => <Input id={id} type="number" step="0.1" min={0.1} max={20} value={form.expRate} onChange={num('expRate')} />}
          </Field>
          <Field label="Taux de capture" error={s.field('palCaptureRate')}>
            {(id) => <Input id={id} type="number" step="0.1" min={0.5} max={2} value={form.palCaptureRate} onChange={num('palCaptureRate')} />}
          </Field>
          <Field label="Taux de récolte" error={s.field('collectionDropRate')}>
            {(id) => <Input id={id} type="number" step="0.1" min={0.5} max={3} value={form.collectionDropRate} onChange={num('collectionDropRate')} />}
          </Field>
          <Field label="Butin des ennemis" error={s.field('enemyDropItemRate')}>
            {(id) => <Input id={id} type="number" step="0.1" min={0.5} max={3} value={form.enemyDropItemRate} onChange={num('enemyDropItemRate')} />}
          </Field>
          <Field label="Pénalité de mort">
            {(id) => (
              <Select id={id} value={form.deathPenalty} onChange={(e) => set('deathPenalty', e.target.value as PalworldSetup['deathPenalty'])}>
                <option value="None">Aucune</option>
                <option value="Item">Objets</option>
                <option value="ItemAndEquipment">Objets et équipement</option>
                <option value="All">Tout (Pals compris)</option>
              </Select>
            )}
          </Field>
          <div className="flex items-end pb-2">
            <Toggle checked={form.pvp} onChange={(v) => set('pvp', v)} label="PvP" description="Dégâts entre joueurs" />
          </div>
        </div>
      </details>

      <details className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/40">
        <summary className="cursor-pointer text-sm font-semibold">Réseau (avancé)</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Port de jeu (UDP)" help="Ouvert automatiquement dans le pare-feu" error={s.field('port')}>
            {(id) => <Input id={id} type="number" value={form.port} onChange={num('port')} />}
          </Field>
          <Field label="Port de l'API REST" help="Local uniquement, jamais exposé sur Internet" error={s.field('restApiPort')}>
            {(id) => <Input id={id} type="number" value={form.restApiPort} onChange={num('restApiPort')} />}
          </Field>
        </div>
      </details>

      {s.error && !(s.error instanceof ApiError && s.error.details) && <Alert kind="error">{s.error.message}</Alert>}
      {s.error instanceof ApiError && s.error.details && <Alert kind="error">Vérifie les champs en rouge.</Alert>}
      <Button type="submit" loading={s.busy}>
        Enregistrer et passer à l'installation
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
      setTasks((ts) => ts.map((t) => (t.id === msg.data.id ? msg.data : t)));
      if (msg.data.status === 'running') {
        setSelected(msg.data.id);
        setLogs((l) => ({ ...l, [msg.data.id]: [] }));
      }
      if (msg.data.status !== 'running') setTimeout(() => void onChange(), 400);
    } else if (msg.type === 'task-log') {
      setLogs((l) => ({ ...l, [msg.data.id]: [...(l[msg.data.id] ?? []), msg.data.line].slice(-500) }));
    }
  });

  const running = tasks.find((t) => t.status === 'running');
  const failed = tasks.find((t) => t.status === 'failed');
  const started = tasks.some((t) => t.status !== 'pending');
  const shown = selected ?? running?.id ?? failed?.id ?? null;

  // Recharge le journal d'une étape passée (après un rafraîchissement de la page).
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

  // Filet de sécurité si le WebSocket est coupé : on relit l'état toutes les 3 secondes.
  useEffect(() => {
    if (!state.installing && !running) return;
    const t = setInterval(() => void onChange(), 3000);
    return () => clearInterval(t);
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
      <StepTitle title="Installation du serveur">
        SteamCMD puis le serveur dédié Palworld (plusieurs Go) sont téléchargés sur ton VPS. Selon la connexion, cela prend de 2 à 15 minutes.
        Tu peux fermer cette page : l'installation continue.
      </StepTitle>
      <ol className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setSelected(t.id)}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                shown === t.id ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
              )}
            >
              <TaskIcon status={t.status} />
              <span className={cx('flex-1', t.status === 'pending' && 'text-slate-400')}>{t.label}</span>
              {t.status === 'failed' && <Badge tone="red">Échec</Badge>}
            </button>
          </li>
        ))}
      </ol>

      {shown && (
        <pre
          ref={logRef}
          className="h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200"
        >
          {(logs[shown] ?? []).join('\n') || 'En attente…'}
        </pre>
      )}

      {failed && (
        <Alert kind="error">
          <p className="font-semibold">L'étape « {failed.label} » a échoué.</p>
          <p className="mt-1">{failed.error}</p>
        </Alert>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        {!started && <Button onClick={() => void start()}>Lancer l'installation</Button>}
        {failed && !running && (
          <>
            <Button onClick={() => void start()}>
              <RotateCcw className="h-4 w-4" /> Réessayer
            </Button>
            <Button variant="secondary" onClick={onEditServer}>
              Modifier les réglages du serveur
            </Button>
          </>
        )}
        {running && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Installation en cours…
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
      <StepTitle title="Compte administrateur">
        C'est le compte principal du panel admin : il permet de gérer le serveur et le site. Garde ses identifiants précieusement.
      </StepTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nom d'utilisateur" error={s.field('username')}>
          {(id) => <Input id={id} value={form.username} onChange={set('username')} autoComplete="username" required />}
        </Field>
        <Field label="Email" error={s.field('email')}>
          {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} autoComplete="email" required />}
        </Field>
        <Field label="Mot de passe" help="8 caractères minimum" error={s.field('password')}>
          {(id) => <Input id={id} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />}
        </Field>
        <Field label="Confirmation" error={mismatch ? 'Les mots de passe ne correspondent pas' : undefined}>
          {(id) => <Input id={id} type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />}
        </Field>
      </div>
      {s.error && <Alert kind="error">{s.error.message}</Alert>}
      <Button type="submit" loading={s.busy} disabled={mismatch}>
        Créer le compte
      </Button>
    </form>
  );
}

const PRESETS = ['#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#eab308', '#14b8a6', '#ef4444'];

function SiteStep({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    name: 'Mon serveur Palworld',
    tagline: 'Un serveur communautaire Palworld',
    accentColor: '#22c55e',
    defaultTheme: 'dark' as 'dark' | 'light' | 'system',
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
      <StepTitle title="Ton site">Les bases de l'apparence. Tout se personnalise ensuite dans « Gestion du site ».</StepTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nom de la communauté" error={s.field('name')}>
          {(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} required />}
        </Field>
        <Field label="Slogan" error={s.field('tagline')}>
          {(id) => <Input id={id} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />}
        </Field>
        <Field label="Couleur principale" error={s.field('accentColor')}>
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
        <Field label="Thème par défaut">
          {(id) => (
            <Select id={id} value={form.defaultTheme} onChange={(e) => set('defaultTheme', e.target.value as typeof form.defaultTheme)}>
              <option value="dark">Sombre</option>
              <option value="light">Clair</option>
              <option value="system">Selon l'appareil du visiteur</option>
            </Select>
          )}
        </Field>
        <Field label="Lien d'invitation Discord" help="Facultatif" error={s.field('discordUrl')} className="md:col-span-2">
          {(id) => <Input id={id} value={form.discordUrl} onChange={(e) => set('discordUrl', e.target.value)} placeholder="https://discord.gg/…" />}
        </Field>
        <Field label="Logo" help="Facultatif — PNG, JPG, GIF ou WebP" className="md:col-span-2">
          {() => <ImageField value={form.logoUrl} onChange={(v) => set('logoUrl', v)} uploadPath="setup/upload" />}
        </Field>
      </div>
      {s.error && <Alert kind="error">{s.error.message}</Alert>}
      <Button type="submit" loading={s.busy}>
        Continuer
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
      <StepTitle title="Tout est prêt !">
        {mode === 'managed'
          ? 'Le serveur Palworld tourne et ton compte administrateur est créé. Il reste à finaliser le site : contenus de départ, modules et tâches automatiques.'
          : mode === 'external'
            ? 'Ton serveur est connecté et ton compte administrateur est créé. Il reste à finaliser le site : contenus de départ et modules.'
            : 'Ton compte administrateur est créé. Le site sera prêt dans un instant ; tu pourras connecter un serveur plus tard dans Panel admin > Connexion au serveur.'}
      </StepTitle>
      {s.error && <Alert kind="error">{s.error.message}</Alert>}
      <Button onClick={finish} loading={s.busy} className="mx-auto">
        Installer le CMS et ouvrir mon site
      </Button>
    </div>
  );
}

// Assistant

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
  // On peut revenir sur le choix du serveur tant que l'installation n'a pas commencé.
  const canGoBack = !changeMode && (step === 'server' || step === 'external' || (step === 'install' && !state.tasks.some((t) => t.status !== 'pending')));

  return (
    <Shell step={step} mode={state.mode}>
      {canGoBack && (
        <button type="button" onClick={() => setChangeMode(true)} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent">
          <ArrowLeft className="h-4 w-4" /> Changer de choix
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
