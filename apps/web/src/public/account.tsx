import { Suspense, lazy, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Gamepad2, Mail, ShieldCheck } from 'lucide-react';
import type { PlayerProfile, PublicUser } from '@palcms/shared';
import { api, ApiError, errorText, url } from '../lib/api';
import { useApp } from '../lib/app';
import { formatDuration } from '../lib/format';
import { t, tm } from '../lib/i18n';
import { Alert, Badge, Button, Card, Field, Input } from '../components/ui';
import { Container, NotFound } from './pages';
import { Slot } from '../lib/extensions';

const CharacterSection = lazy(() => import('../features/world-public').then((m) => ({ default: m.CharacterSection })));

function SteamButton({ label }: { label: string }) {
  return (
    <a
      href={url('api/auth/steam')}
      className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#171a21] px-4 py-3 font-semibold text-white hover:bg-[#2a475e]"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M11.98 0C5.67 0 .5 4.86.02 11.04l6.43 2.66a3.4 3.4 0 0 1 1.92-.59l2.86-4.15v-.06a4.53 4.53 0 1 1 4.53 4.53h-.1l-4.08 2.91c0 .05.01.1.01.16a3.4 3.4 0 0 1-6.74.66L.3 15.3A12 12 0 1 0 11.98 0ZM7.54 18.21l-1.47-.61a2.55 2.55 0 1 0 1.4-3.5l1.52.63a1.88 1.88 0 1 1-1.45 3.48Zm11.4-9.27a3.02 3.02 0 1 0-6.04 0 3.02 3.02 0 0 0 6.04 0Zm-5.28-.01a2.27 2.27 0 1 1 4.54 0 2.27 2.27 0 0 1-4.54 0Z" />
      </svg>
      {label}
    </a>
  );
}

function Divider({ text }: { text: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      {text}
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

export function LoginPage() {
  const { boot, setUser, isAdmin } = useApp();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ login: '', password: '' });
  // Steam errors come back in the URL (English text from the server).
  const urlError = params.get('error') ?? params.get('erreur');
  const [error, setError] = useState(urlError ? tm(urlError) : '');
  const [busy, setBusy] = useState(false);
  const reg = boot.site.registration;

  // Already logged in (or right after logging in): the team goes to the panel, players to their profile.
  if (boot.user) return <Navigate to={isAdmin ? '/admin' : '/profile'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api.post<{ user: PublicUser }>('auth/login', form);
      setUser(user);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container narrow>
      <div className="mx-auto max-w-md">
        <h1 className="text-center text-3xl font-bold">{t('Log in')}</h1>
        <Card className="mt-8">
          {reg.steam && boot.modules.registration && (
            <>
              <SteamButton label={t('Sign in with Steam')} />
              <Divider text={t('or with your account')} />
            </>
          )}
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <Field label={t('Username or email')}>
              {(id) => <Input id={id} value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} autoComplete="username" required />}
            </Field>
            <Field label={t('Password')}>
              {(id) => (
                <Input id={id} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
              )}
            </Field>
            {error && <Alert kind="error">{error}</Alert>}
            <Button type="submit" loading={busy} className="w-full">
              {t('Log in')}
            </Button>
          </form>
          {boot.modules.registration && (reg.email || reg.steam) && (
            <p className="mt-6 text-center text-sm text-slate-500">
              {t('No account yet?')}{' '}
              <Link to="/register" className="font-medium text-accent">
                {t('Sign up')}
              </Link>
            </p>
          )}
        </Card>
      </div>
    </Container>
  );
}

export function RegisterPage() {
  const { boot, setUser } = useApp();
  const navigate = useNavigate();
  const reg = boot.site.registration;
  const [method, setMethod] = useState<'steam' | 'email' | null>(reg.steam && !reg.email ? 'steam' : !reg.steam && reg.email ? 'email' : null);
  const [form, setForm] = useState({ username: '', email: '', password: '', inGameName: '' });
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [busy, setBusy] = useState(false);

  if (!boot.modules.registration || (!reg.steam && !reg.email)) return <NotFound />;
  if (boot.user) return <Navigate to="/profile" replace />;

  const field = (n: string) => (error instanceof ApiError ? error.field(n) : undefined);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: PublicUser }>('auth/register', form);
      setUser(user);
      navigate('/profile');
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  };

  const choice = (id: 'steam' | 'email', Icon: typeof Mail, title: string, text: string, badge: string) => (
    <button
      type="button"
      onClick={() => setMethod(id)}
      className="flex w-full items-start gap-4 rounded-xl p-4 text-left ring-2 ring-slate-200 transition hover:ring-accent dark:ring-slate-800"
    >
      <Icon className="mt-1 h-6 w-6 shrink-0 text-accent" />
      <span>
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {title} <Badge tone={id === 'steam' ? 'green' : 'amber'}>{badge}</Badge>
        </span>
        <span className="mt-1 block text-sm text-slate-500">{text}</span>
      </span>
    </button>
  );

  return (
    <Container narrow>
      <div className="mx-auto max-w-md">
        <h1 className="text-center text-3xl font-bold">{t('Create an account')}</h1>
        <Card className="mt-8">
          {method === null && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">{t('How do you want to sign up?')}</p>
              {choice(
                'steam',
                Gamepad2,
                t('With Steam'),
                t('Your account is linked to your in-game character automatically. Nothing to wait for.'),
                t('Approved automatically'),
              )}
              {choice('email', Mail, t('With an email'), t('A team member checks your in-game name, then approves your account.'), t('Approved by an admin'))}
            </div>
          )}

          {method === 'steam' && (
            <div className="space-y-4">
              <Alert kind="info">{t('You will be sent to Steam to log in. The site never receives your Steam password, only your public id.')}</Alert>
              <SteamButton label={t('Sign up with Steam')} />
            </div>
          )}

          {method === 'email' && (
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <Field label={t('Username')} error={field('username')}>
                {(id) => <Input id={id} value={form.username} onChange={set('username')} autoComplete="username" required />}
              </Field>
              <Field label={t('Email')} error={field('email')}>
                {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} autoComplete="email" required />}
              </Field>
              <Field label={t('Password')} help={t('At least 8 characters')} error={field('password')}>
                {(id) => <Input id={id} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />}
              </Field>
              <Field label={t('Your in-game name (Palworld)')} help={t('So the team can find you and approve your account')} error={field('inGameName')}>
                {(id) => <Input id={id} value={form.inGameName} onChange={set('inGameName')} required />}
              </Field>
              {error && !field('username') && !field('email') && !field('password') && !field('inGameName') && <Alert kind="error">{error.message}</Alert>}
              <Button type="submit" loading={busy} className="w-full">
                {t('Create my account')}
              </Button>
            </form>
          )}

          {method !== null && reg.steam && reg.email && (
            <button type="button" onClick={() => setMethod(null)} className="mt-4 w-full text-center text-sm text-slate-500 hover:text-accent">
              ← {t('Choose another method')}
            </button>
          )}
          <p className="mt-6 text-center text-sm text-slate-500">
            {t('Already registered?')}{' '}
            <Link to="/login" className="font-medium text-accent">
              {t('Log in')}
            </Link>
          </p>
        </Card>
      </div>
    </Container>
  );
}

export function ProfilePage() {
  const { boot, setUser } = useApp();
  const [params] = useSearchParams();
  const user = boot.user;
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user?.playerPublicId) api.get<PlayerProfile>(`public/players/${user.playerPublicId}`).then(setPlayer).catch(() => {});
  }, [user?.playerPublicId]);

  if (!user) return <Navigate to="/login" replace />;

  const save = async (body: Record<string, string>) => {
    setMsg(null);
    try {
      const r = await api.patch<{ user: PublicUser }>('auth/me', body);
      setUser(r.user);
      setPwd({ currentPassword: '', newPassword: '' });
      setMsg({ kind: 'success', text: t('Changes saved.') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <Container narrow>
      <div className="flex flex-wrap items-center gap-4">
        {user.avatarUrl && <img src={user.avatarUrl} alt="" className="h-16 w-16 rounded-full" />}
        <div>
          <h1 className="text-3xl font-bold">{user.displayName}</h1>
          <p className="text-sm text-slate-500">@{user.username}</p>
        </div>
      </div>

      {(params.get('welcome') || params.get('bienvenue')) && (
        <Alert kind="success" className="mt-6">
          {t('Welcome! Your Steam account is created and linked to your character automatically.')}
        </Alert>
      )}
      {user.status === 'pending' && (
        <Alert kind="warning" className="mt-6">
          <p className="font-semibold">{t('Account waiting for approval')}</p>
          <p className="mt-1">{t('An administrator will check your in-game name. You can also link your Steam account: your account is then approved right away.')}</p>
        </Alert>
      )}

      <div className="mt-8 grid gap-6">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4" /> {t('My character')}
            </span>
          }
        >
          {player ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-slate-500">{t('Character')}</p>
                <Link to={`/players/${player.id}`} className="font-semibold text-accent">
                  {player.name}
                </Link>
              </div>
              <div>
                <p className="text-xs text-slate-500">{t('Level')}</p>
                <p className="font-semibold">{player.level}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{t('Playtime')}</p>
                <p className="flex items-center justify-center gap-1 font-semibold">
                  <Clock className="h-3 w-3" />
                  {formatDuration(player.playtimeSeconds)}
                </p>
              </div>
            </div>
          ) : user.steam ? (
            <p className="text-sm text-slate-500">{t('Your Steam account is linked. Your character will show up here after your first time on the server.')}</p>
          ) : (
            <p className="text-sm text-slate-500">{t('No character linked yet.')}</p>
          )}
          {!user.steam && boot.site.registration.steam && (
            <div className="mt-4">
              <SteamButton label={t('Link my Steam account')} />
            </div>
          )}
          {user.steam && (
            <p className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <ShieldCheck className="h-4 w-4" /> {t('Steam account linked')}
            </p>
          )}
        </Card>

        <Suspense fallback={null}>
          <CharacterSection />
        </Suspense>

        <Slot name="profile" user={user} />

        {boot.modules.tickets && (
          <Link to="/report" className="text-sm font-medium text-accent">
            {t('Report a problem or suggest an idea to the team')} →
          </Link>
        )}

        <Card title={t('My account')}>
          {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ displayName });
            }}
          >
            <Field label={t('Display name')} className="min-w-48 flex-1">
              {(id) => <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
            </Field>
            <Button type="submit" variant="secondary">
              {t('Save')}
            </Button>
          </form>
          <form
            className="mt-6 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save(user.steam && !pwd.currentPassword ? { newPassword: pwd.newPassword } : pwd);
            }}
          >
            <Field label={t('Current password')} help={user.steam ? t('Empty if you never set one (Steam account)') : undefined}>
              {(id) => (
                <Input id={id} type="password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} autoComplete="current-password" />
              )}
            </Field>
            <Field label={t('New password')}>
              {(id) => (
                <Input id={id} type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} autoComplete="new-password" />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" disabled={pwd.newPassword.length < 8}>
                {t('Change the password')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Container>
  );
}
