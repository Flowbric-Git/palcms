import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, Check, Gamepad2, Link2, Plus, Save, Trash2, X } from 'lucide-react';
import type { ModuleInfo, SiteSettings } from '@palcms/shared';
import { api, ApiError, errorText } from '../lib/api';
import { useApp } from '../lib/app';
import { applyTheme } from '../lib/theme';
import { formatDate, timeAgo } from '../lib/format';
import { ImageField } from '../components/ImageField';
import { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle, cx } from '../components/ui';
import { useLoad } from './AdminLayout';

/** Réglages du site partagés par les pages Menu et Apparence. */
function useSiteSettings() {
  const { refresh } = useApp();
  const { data, error } = useLoad<{ site: SiteSettings; steamApiKeySet: boolean }>('admin/site/settings');
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string; err?: ApiError } | null>(null);
  useEffect(() => {
    if (data) setSite(data.site);
  }, [data]);
  const save = async (value = site) => {
    if (!value) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.put('admin/site/settings', value);
      await refresh();
      setMsg({ kind: 'success', text: 'Réglages enregistrés.' });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e), err: e instanceof ApiError ? e : undefined });
    } finally {
      setBusy(false);
    }
  };
  return { site, setSite, save, busy, msg, error, steamApiKeySet: data?.steamApiKeySet ?? false };
}

// Menu

export function MenuPage() {
  const { site, setSite, save, busy, msg, error } = useSiteSettings();
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!site) return <Spinner />;
  const menu = site.menu;
  const update = (i: number, patch: Partial<(typeof menu)[number]>) => setSite({ ...site, menu: menu.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...menu];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSite({ ...site, menu: next });
  };
  return (
    <>
      <PageHeader
        title="Menu du site"
        description="Liens affichés en haut du site public. Un lien interne commence par / (ex. /p/regles), un lien externe par https://."
        actions={
          <Button onClick={() => void save()} loading={busy}>
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        }
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <Card>
        <div className="space-y-2">
          {menu.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input value={m.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Libellé" className="w-40" />
              <Input value={m.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="/p/ma-page ou https://…" className="min-w-48 flex-1 font-mono" />
              <Button variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" disabled={i === menu.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setSite({ ...site, menu: menu.filter((_, j) => j !== i) })} aria-label="Supprimer">
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-4" disabled={menu.length >= 20} onClick={() => setSite({ ...site, menu: [...menu, { label: 'Nouveau lien', url: '/' }] })}>
          <Plus className="h-4 w-4" /> Ajouter un lien
        </Button>
        <p className="mt-4 text-xs text-slate-500">
          Pages disponibles : / (accueil), /actualites, /classement, /p/&lt;adresse&gt; pour tes pages, /inscription, /connexion.
        </p>
      </Card>
    </>
  );
}

// Apparence

export function AppearancePage() {
  const { site, setSite, save, busy, msg, error, steamApiKeySet } = useSiteSettings();
  const [steamKey, setSteamKey] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!site) return <Spinner />;
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => {
    const next = { ...site, [k]: v };
    setSite(next);
    if (k === 'accentColor' || k === 'defaultTheme') applyTheme(next);
  };
  const f = (n: string) => msg?.err?.field(n);

  const saveSteamKey = async () => {
    try {
      await api.put('admin/site/steam-api-key', { key: steamKey });
      setKeyMsg(steamKey ? 'Clé Steam enregistrée.' : 'Clé Steam supprimée.');
      setSteamKey('');
    } catch (e) {
      setKeyMsg(errorText(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Apparence et réglages"
        actions={
          <Button onClick={() => void save()} loading={busy}>
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        }
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <div className="grid gap-6">
        <Card title="Identité">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom du site" error={f('name')}>
              {(id) => <Input id={id} value={site.name} onChange={(e) => set('name', e.target.value)} />}
            </Field>
            <Field label="Slogan" error={f('tagline')}>
              {(id) => <Input id={id} value={site.tagline} onChange={(e) => set('tagline', e.target.value)} />}
            </Field>
            <Field label="Logo">{() => <ImageField value={site.logoUrl} onChange={(v) => set('logoUrl', v)} />}</Field>
            <Field label="Bannière de l'accueil" help="Image large, idéalement 1920×600">
              {() => <ImageField value={site.bannerUrl} onChange={(v) => set('bannerUrl', v)} previewClass="h-16 w-32" />}
            </Field>
          </div>
        </Card>

        <Card title="Couleurs et thème">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Couleur principale" error={f('accentColor')}>
              {(id) => (
                <div className="flex items-center gap-2">
                  <input id={id} type="color" value={site.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="h-10 w-14 cursor-pointer rounded bg-transparent" />
                  <Input value={site.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="font-mono" />
                </div>
              )}
            </Field>
            <Field label="Thème par défaut">
              {(id) => (
                <Select id={id} value={site.defaultTheme} onChange={(e) => set('defaultTheme', e.target.value as SiteSettings['defaultTheme'])}>
                  <option value="dark">Sombre</option>
                  <option value="light">Clair</option>
                  <option value="system">Selon l'appareil du visiteur</option>
                </Select>
              )}
            </Field>
            <div className="flex items-end pb-2">
              <Toggle checked={site.allowThemeToggle} onChange={(v) => set('allowThemeToggle', v)} label="Bouton clair / sombre" description="Les visiteurs peuvent changer de thème" />
            </div>
          </div>
        </Card>

        <Card title="Accueil">
          <div className="grid gap-4">
            <Field label="Grand titre" error={f('heroTitle')}>
              {(id) => <Input id={id} value={site.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} />}
            </Field>
            <Field label="Texte d'accroche" error={f('heroText')}>
              {(id) => <Textarea id={id} value={site.heroText} onChange={(e) => set('heroText', e.target.value)} rows={2} />}
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Adresse du serveur affichée" help="Vide = détectée automatiquement (IP:port)" error={f('serverAddress')}>
                {(id) => <Input id={id} value={site.serverAddress} onChange={(e) => set('serverAddress', e.target.value)} placeholder="play.monserveur.fr:8211" />}
              </Field>
              <Field label="Lien Discord" error={f('discordUrl')}>
                {(id) => <Input id={id} value={site.discordUrl} onChange={(e) => set('discordUrl', e.target.value)} placeholder="https://discord.gg/…" />}
              </Field>
            </div>
            <Field label="Texte du pied de page" error={f('footerText')}>
              {(id) => <Input id={id} value={site.footerText} onChange={(e) => set('footerText', e.target.value)} />}
            </Field>
          </div>
        </Card>

        <Card title="Inscription des joueurs">
          <div className="space-y-4">
            <Toggle
              checked={site.registration.steam}
              onChange={(v) => set('registration', { ...site.registration, steam: v })}
              label="Connexion avec Steam"
              description="Le compte est validé et relié au personnage automatiquement"
            />
            <Toggle
              checked={site.registration.email}
              onChange={(v) => set('registration', { ...site.registration, email: v })}
              label="Inscription par email"
              description="Le compte doit être validé par un administrateur (rubrique Membres)"
            />
            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/40">
              <p className="text-sm font-medium">
                Clé Steam Web API <Badge tone={steamApiKeySet ? 'green' : 'slate'}>{steamApiKeySet ? 'configurée' : 'facultative'}</Badge>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Permet de récupérer le pseudo et l'avatar Steam à l'inscription. À obtenir sur steamcommunity.com/dev/apikey.
              </p>
              <div className="mt-3 flex gap-2">
                <Input type="password" value={steamKey} onChange={(e) => setSteamKey(e.target.value)} placeholder={steamApiKeySet ? '•••••••• (laisser vide pour supprimer)' : 'Clé API Steam'} />
                <Button variant="secondary" onClick={() => void saveSteamKey()}>
                  Enregistrer
                </Button>
              </div>
              {keyMsg && <p className="mt-2 text-xs text-slate-500">{keyMsg}</p>}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

// Modules

export function ModulesPage() {
  const { refresh } = useApp();
  const { data, error, setData } = useLoad<ModuleInfo[]>('admin/site/modules');
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;
  const toggle = async (m: ModuleInfo, enabled: boolean) => {
    setData(await api.put<ModuleInfo[]>(`admin/site/modules/${m.id}`, { enabled }));
    await refresh();
  };
  const areas: { id: ModuleInfo['area']; title: string }[] = [
    { id: 'public', title: 'Site public' },
    { id: 'site', title: 'Gestion du site' },
    { id: 'server', title: 'Gestion du serveur' },
  ];
  return (
    <>
      <PageHeader title="Modules" description="Active ou désactive les fonctionnalités du site. De nouveaux modules arriveront avec les mises à jour." />
      <div className="space-y-6">
        {areas.map((a) => (
          <Card key={a.id} title={a.title}>
            <ul className="space-y-4">
              {data
                .filter((m) => m.area === a.id)
                .map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-4">
                    <Toggle
                      checked={m.enabled}
                      onChange={(v) => void toggle(m, v)}
                      disabled={!m.toggleable}
                      label={m.name}
                      description={m.toggleable ? m.description : `${m.description} (toujours actif)`}
                    />
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

// Membres

interface Member {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: 'superadmin' | 'admin' | 'player';
  status: 'active' | 'pending' | 'rejected' | 'banned';
  inGameName: string | null;
  steam: number;
  playerUid: string | null;
  playerName: string | null;
  playerLevel: number | null;
  createdAt: number;
  lastLoginAt: number | null;
}

interface KnownPlayer {
  uid: string;
  name: string;
  level: number;
  lastSeen: number;
}

const STATUS: Record<Member['status'], { text: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  active: { text: 'Actif', tone: 'green' },
  pending: { text: 'En attente', tone: 'amber' },
  rejected: { text: 'Refusé', tone: 'slate' },
  banned: { text: 'Banni', tone: 'red' },
};

function PlayerPicker({ players, value, onChange, hint }: { players: KnownPlayer[]; value: string; onChange: (v: string) => void; hint: string | null }) {
  const sorted = hint
    ? [...players].sort((a, b) => Number(b.name.toLowerCase() === hint.toLowerCase()) - Number(a.name.toLowerCase() === hint.toLowerCase()))
    : players;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-56">
      <option value="">— Aucun personnage —</option>
      {sorted.map((p) => (
        <option key={p.uid} value={p.uid}>
          {p.name} (niv. {p.level}){hint && p.name.toLowerCase() === hint.toLowerCase() ? ' ✓' : ''}
        </option>
      ))}
    </Select>
  );
}

export function MembersPage() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const { data, error, reload } = useLoad<Member[]>(tab === 'pending' ? 'admin/members?status=pending' : 'admin/members');
  const players = useLoad<KnownPlayer[]>('admin/members/players');
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<string>('');

  const act = async (m: Member, action: string, body?: unknown) => {
    setMsg('');
    try {
      if (action === 'delete') {
        if (!window.confirm(`Supprimer définitivement le compte « ${m.username} » ?`)) return;
        await api.del(`admin/members/${m.id}`);
      } else {
        await api.post(`admin/members/${m.id}/${action}`, body ?? {});
      }
      reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  const pick = (m: Member) => {
    if (choice[m.id] !== undefined) return choice[m.id];
    if (m.playerUid) return m.playerUid;
    const match = players.data?.find((p) => m.inGameName && p.name.toLowerCase() === m.inGameName.toLowerCase());
    return match?.uid ?? '';
  };

  return (
    <>
      <PageHeader title="Membres" description="Comptes joueurs du site. Les inscriptions par email doivent être validées ici." />
      <div className="mb-4 flex gap-2">
        {(['pending', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx('rounded-lg px-4 py-2 text-sm font-medium', tab === t ? 'bg-accent text-accent-fg' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800')}
          >
            {t === 'pending' ? 'À valider' : 'Tous les membres'}
          </button>
        ))}
      </div>
      {msg && <Alert kind="error" className="mb-4">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Empty>{tab === 'pending' ? 'Aucune inscription en attente.' : 'Aucun membre.'}</Empty>
      ) : (
        <div className="space-y-3">
          {data.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-48 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {m.displayName}
                    <span className="text-sm font-normal text-slate-500">@{m.username}</span>
                    <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].text}</Badge>
                    {m.role !== 'player' && <Badge tone="accent">{m.role === 'superadmin' ? 'Admin principal' : 'Admin'}</Badge>}
                    {!!m.steam && (
                      <Badge tone="blue">
                        <Gamepad2 className="h-3 w-3" /> Steam
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.email ?? 'sans email'} · inscrit le {formatDate(m.createdAt)}
                    {m.lastLoginAt && ` · vu ${timeAgo(m.lastLoginAt)}`}
                  </p>
                  <p className="mt-1 text-sm">
                    Pseudo en jeu déclaré : <strong>{m.inGameName ?? '—'}</strong>
                    {m.playerName && (
                      <>
                        {' '}
                        · Personnage lié : <strong>{m.playerName}</strong> (niv. {m.playerLevel})
                      </>
                    )}
                  </p>
                </div>

                {m.role !== 'superadmin' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!m.steam && players.data && m.status !== 'banned' && (
                      <PlayerPicker players={players.data} value={pick(m)} onChange={(v) => setChoice({ ...choice, [m.id]: v })} hint={m.inGameName} />
                    )}
                    {m.status === 'pending' && (
                      <>
                        <Button onClick={() => void act(m, 'approve', { playerUid: pick(m) || null })}>
                          <Check className="h-4 w-4" /> Valider
                        </Button>
                        <Button variant="secondary" onClick={() => void act(m, 'reject')}>
                          <X className="h-4 w-4" /> Refuser
                        </Button>
                      </>
                    )}
                    {m.status === 'active' && !m.steam && (
                      <Button variant="secondary" onClick={() => void act(m, 'link', { playerUid: pick(m) || null })}>
                        <Link2 className="h-4 w-4" /> Lier
                      </Button>
                    )}
                    {m.status === 'active' && (
                      <Button variant="ghost" onClick={() => void act(m, 'ban')} title="Bannir du site">
                        <Ban className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                    {(m.status === 'banned' || m.status === 'rejected') && (
                      <Button variant="secondary" onClick={() => void act(m, 'unban')}>
                        Réactiver
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => void act(m, 'delete')} title="Supprimer">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === 'pending' && players.data?.length === 0 && (
        <p className="mt-4 text-xs text-slate-500">Aucun personnage connu pour l'instant : ils apparaissent dès leur première connexion au serveur.</p>
      )}
    </>
  );
}
