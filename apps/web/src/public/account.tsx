import { Suspense, lazy, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Gamepad2, Mail, ShieldCheck } from 'lucide-react';
import type { PlayerProfile, PublicUser } from '@palcms/shared';
import { api, ApiError, errorText, url } from '../lib/api';
import { useApp } from '../lib/app';
import { formatDuration } from '../lib/format';
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
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState(params.get('erreur') ?? '');
  const [busy, setBusy] = useState(false);
  const reg = boot.site.registration;

  // Déjà connecté (ou juste après la connexion) : l'équipe va au panel, les joueurs à leur profil.
  if (boot.user) return <Navigate to={isAdmin ? '/admin' : '/profil'} replace />;

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
        <h1 className="text-center text-3xl font-bold">Connexion</h1>
        <Card className="mt-8">
          {reg.steam && boot.modules.registration && (
            <>
              <SteamButton label="Se connecter avec Steam" />
              <Divider text="ou avec ton compte" />
            </>
          )}
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <Field label="Nom d'utilisateur ou email">
              {(id) => <Input id={id} value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} autoComplete="username" required />}
            </Field>
            <Field label="Mot de passe">
              {(id) => (
                <Input id={id} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
              )}
            </Field>
            {error && <Alert kind="error">{error}</Alert>}
            <Button type="submit" loading={busy} className="w-full">
              Se connecter
            </Button>
          </form>
          {boot.modules.registration && (reg.email || reg.steam) && (
            <p className="mt-6 text-center text-sm text-slate-500">
              Pas encore de compte ?{' '}
              <Link to="/inscription" className="font-medium text-accent">
                Inscris-toi
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
  if (boot.user) return <Navigate to="/profil" replace />;

  const field = (n: string) => (error instanceof ApiError ? error.field(n) : undefined);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: PublicUser }>('auth/register', form);
      setUser(user);
      navigate('/profil');
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
        <h1 className="text-center text-3xl font-bold">Créer un compte</h1>
        <Card className="mt-8">
          {method === null && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Comment veux-tu t'inscrire ?</p>
              {choice(
                'steam',
                Gamepad2,
                'Avec Steam',
                'Ton compte est relié automatiquement à ton personnage en jeu. Rien à attendre.',
                'Validé automatiquement',
              )}
              {choice('email', Mail, 'Avec un email', "Un membre de l'équipe vérifie ton pseudo en jeu puis valide ton compte.", 'Validé par un admin')}
            </div>
          )}

          {method === 'steam' && (
            <div className="space-y-4">
              <Alert kind="info">
                Tu vas être redirigé vers Steam pour te connecter. Le site ne reçoit jamais ton mot de passe Steam, uniquement ton identifiant public.
              </Alert>
              <SteamButton label="S'inscrire avec Steam" />
            </div>
          )}

          {method === 'email' && (
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <Field label="Nom d'utilisateur" error={field('username')}>
                {(id) => <Input id={id} value={form.username} onChange={set('username')} autoComplete="username" required />}
              </Field>
              <Field label="Email" error={field('email')}>
                {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} autoComplete="email" required />}
              </Field>
              <Field label="Mot de passe" help="8 caractères minimum" error={field('password')}>
                {(id) => <Input id={id} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />}
              </Field>
              <Field label="Ton pseudo en jeu (Palworld)" help="Pour que l'équipe te retrouve et valide ton compte" error={field('inGameName')}>
                {(id) => <Input id={id} value={form.inGameName} onChange={set('inGameName')} required />}
              </Field>
              {error && !field('username') && !field('email') && !field('password') && !field('inGameName') && <Alert kind="error">{error.message}</Alert>}
              <Button type="submit" loading={busy} className="w-full">
                Créer mon compte
              </Button>
            </form>
          )}

          {method !== null && reg.steam && reg.email && (
            <button type="button" onClick={() => setMethod(null)} className="mt-4 w-full text-center text-sm text-slate-500 hover:text-accent">
              ← Choisir une autre méthode
            </button>
          )}
          <p className="mt-6 text-center text-sm text-slate-500">
            Déjà inscrit ?{' '}
            <Link to="/connexion" className="font-medium text-accent">
              Connexion
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

  if (!user) return <Navigate to="/connexion" replace />;

  const save = async (body: Record<string, string>) => {
    setMsg(null);
    try {
      const r = await api.patch<{ user: PublicUser }>('auth/me', body);
      setUser(r.user);
      setPwd({ currentPassword: '', newPassword: '' });
      setMsg({ kind: 'success', text: 'Modifications enregistrées.' });
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

      {params.get('bienvenue') && (
        <Alert kind="success" className="mt-6">
          Bienvenue ! Ton compte Steam est créé et relié automatiquement à ton personnage.
        </Alert>
      )}
      {user.status === 'pending' && (
        <Alert kind="warning" className="mt-6">
          <p className="font-semibold">Compte en attente de validation</p>
          <p className="mt-1">
            Un administrateur va vérifier ton pseudo en jeu. Tu peux aussi relier ton compte Steam : ton compte sera alors validé immédiatement.
          </p>
        </Alert>
      )}

      <div className="mt-8 grid gap-6">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4" /> Mon personnage
            </span>
          }
        >
          {player ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-slate-500">Personnage</p>
                <Link to={`/joueurs/${player.id}`} className="font-semibold text-accent">
                  {player.name}
                </Link>
              </div>
              <div>
                <p className="text-xs text-slate-500">Niveau</p>
                <p className="font-semibold">{player.level}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Temps de jeu</p>
                <p className="flex items-center justify-center gap-1 font-semibold">
                  <Clock className="h-3 w-3" />
                  {formatDuration(player.playtimeSeconds)}
                </p>
              </div>
            </div>
          ) : user.steam ? (
            <p className="text-sm text-slate-500">
              Ton compte Steam est relié. Ton personnage apparaîtra ici dès ta première connexion au serveur.
            </p>
          ) : (
            <p className="text-sm text-slate-500">Aucun personnage relié pour le moment.</p>
          )}
          {!user.steam && boot.site.registration.steam && (
            <div className="mt-4">
              <SteamButton label="Relier mon compte Steam" />
            </div>
          )}
          {user.steam && (
            <p className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <ShieldCheck className="h-4 w-4" /> Compte Steam relié
            </p>
          )}
        </Card>

        <Suspense fallback={null}>
          <CharacterSection />
        </Suspense>

        <Slot name="profile" user={user} />

        {boot.modules.tickets && (
          <Link to="/signaler" className="text-sm font-medium text-accent">
            Signaler un problème ou proposer une idée à l’équipe →
          </Link>
        )}

        <Card title="Mon compte">
          {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ displayName });
            }}
          >
            <Field label="Nom affiché" className="min-w-48 flex-1">
              {(id) => <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
            </Field>
            <Button type="submit" variant="secondary">
              Enregistrer
            </Button>
          </form>
          <form
            className="mt-6 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save(user.steam && !pwd.currentPassword ? { newPassword: pwd.newPassword } : pwd);
            }}
          >
            <Field label="Mot de passe actuel" help={user.steam ? 'Vide si tu n’en as jamais défini (compte Steam)' : undefined}>
              {(id) => (
                <Input id={id} type="password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} autoComplete="current-password" />
              )}
            </Field>
            <Field label="Nouveau mot de passe">
              {(id) => (
                <Input id={id} type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} autoComplete="new-password" />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" disabled={pwd.newPassword.length < 8}>
                Changer le mot de passe
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Container>
  );
}
