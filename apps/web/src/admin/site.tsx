import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, Check, Gamepad2, Link2, Lock, Plus, Save, Trash2, X } from 'lucide-react';
import { LANGS, type Lang, type ModuleInfo, type SiteSettings } from '@palcms/shared';
import { api, ApiError, errorText } from '../lib/api';
import { useApp } from '../lib/app';
import { applyTheme } from '../lib/theme';
import { formatDate, timeAgo } from '../lib/format';
import { t } from '../lib/i18n';
import { ImageField } from '../components/ImageField';
import { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle, cx } from '../components/ui';
import { useLoad } from './AdminLayout';

/** Site settings shared by the Menu and Appearance pages. */
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
      setMsg({ kind: 'success', text: t('Settings saved.') });
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
  const { boot } = useApp();
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!site) return <Spinner />;
  // Links locked by the active theme are shown apart: they cannot be moved, renamed or deleted.
  const fixed = boot.extensions?.theme?.menuFixed ?? [];
  const fixedUrls = new Set(fixed.map((f) => f.url));
  const locked = fixed.map((f) => ({ label: site.menu.find((m) => m.url === f.url)?.label ?? f.label, url: f.url }));
  const menu = site.menu.filter((m) => !fixedUrls.has(m.url));
  const setMenu = (next: typeof menu) => setSite({ ...site, menu: [...locked, ...next] });
  const update = (i: number, patch: Partial<(typeof menu)[number]>) => setMenu(menu.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...menu];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setMenu(next);
  };
  return (
    <>
      <PageHeader
        title={t('Site menu')}
        description={t('Links shown at the top of the public site. An internal link starts with / (e.g. /p/rules), an external one with https://.')}
        actions={
          <Button onClick={() => void save()} loading={busy}>
            <Save className="h-4 w-4" /> {t('Save')}
          </Button>
        }
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      {locked.length > 0 && (
        <Card title={t('Fixed links of the theme')} className="mb-4">
          <p className="mb-3 text-xs text-slate-500">{t('The active theme lays these links out itself: they cannot be moved or deleted. Everything below can be changed.')}</p>
          <div className="flex flex-wrap gap-2">
            {locked.map((m) => (
              <span key={m.url} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                {m.label}
                <span className="font-mono text-xs text-slate-400">{m.url}</span>
              </span>
            ))}
          </div>
        </Card>
      )}
      <Card title={locked.length > 0 ? t('Other links') : undefined}>
        <div className="space-y-2">
          {menu.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input value={m.label} onChange={(e) => update(i, { label: e.target.value })} placeholder={t('Label')} className="w-40" />
              <Input value={m.url} onChange={(e) => update(i, { url: e.target.value })} placeholder={t('/p/my-page or https://…')} className="min-w-48 flex-1 font-mono" />
              <Button variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Move up')}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" disabled={i === menu.length - 1} onClick={() => move(i, 1)} aria-label={t('Move down')}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setMenu(menu.filter((_, j) => j !== i))} aria-label={t('Delete')}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-4" disabled={locked.length + menu.length >= 20} onClick={() => setMenu([...menu, { label: t('New link'), url: '/' }])}>
          <Plus className="h-4 w-4" /> {t('Add a link')}
        </Button>
        <p className="mt-4 text-xs text-slate-500">
          {t('Available pages: / (home), /news, /leaderboard, /map, /guilds, /paldex, /events, /uptime, /report, /p/<address> for your pages, /register, /login.')}
        </p>
      </Card>
    </>
  );
}

// Appearance

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
      setKeyMsg(steamKey ? t('Steam key saved.') : t('Steam key removed.'));
      setSteamKey('');
    } catch (e) {
      setKeyMsg(errorText(e));
    }
  };

  return (
    <>
      <PageHeader
        title={t('Appearance and settings')}
        actions={
          <Button onClick={() => void save()} loading={busy}>
            <Save className="h-4 w-4" /> {t('Save')}
          </Button>
        }
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <div className="grid gap-6">
        <Card title={t('Identity')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('Site name')} error={f('name')}>
              {(id) => <Input id={id} value={site.name} onChange={(e) => set('name', e.target.value)} />}
            </Field>
            <Field label={t('Tagline')} error={f('tagline')}>
              {(id) => <Input id={id} value={site.tagline} onChange={(e) => set('tagline', e.target.value)} />}
            </Field>
            <Field label={t('Site language')} help={t('Default language for visitors, and language of Discord and in-game messages. Each visitor can still switch with the EN / FR button.')}>
              {(id) => (
                <Select id={id} value={site.language} onChange={(e) => set('language', e.target.value as Lang)}>
                  {LANGS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div />
            <Field label={t('Logo')}>{() => <ImageField value={site.logoUrl} onChange={(v) => set('logoUrl', v)} />}</Field>
            <Field label={t('Home page banner')} help={t('Wide image, ideally 1920×600')}>
              {() => <ImageField value={site.bannerUrl} onChange={(v) => set('bannerUrl', v)} previewClass="h-16 w-32" />}
            </Field>
          </div>
        </Card>

        <Card title={t('Colors and theme')}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t('Main color')} error={f('accentColor')}>
              {(id) => (
                <div className="flex items-center gap-2">
                  <input id={id} type="color" value={site.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="h-10 w-14 cursor-pointer rounded bg-transparent" />
                  <Input value={site.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="font-mono" />
                </div>
              )}
            </Field>
            <Field label={t('Default theme')}>
              {(id) => (
                <Select id={id} value={site.defaultTheme} onChange={(e) => set('defaultTheme', e.target.value as SiteSettings['defaultTheme'])}>
                  <option value="dark">{t('Dark')}</option>
                  <option value="light">{t('Light')}</option>
                  <option value="system">{t("Follow the visitor's device")}</option>
                </Select>
              )}
            </Field>
            <div className="flex items-end pb-2">
              <Toggle checked={site.allowThemeToggle} onChange={(v) => set('allowThemeToggle', v)} label={t('Light / dark button')} description={t('Visitors can switch the theme')} />
            </div>
          </div>
        </Card>

        <Card title={t('Home page')}>
          <div className="grid gap-4">
            <Field label={t('Main title')} error={f('heroTitle')}>
              {(id) => <Input id={id} value={site.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} />}
            </Field>
            <Field label={t('Intro text')} error={f('heroText')}>
              {(id) => <Textarea id={id} value={site.heroText} onChange={(e) => set('heroText', e.target.value)} rows={2} />}
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('Server address shown')} help={t('Empty = detected automatically (IP:port)')} error={f('serverAddress')}>
                {(id) => <Input id={id} value={site.serverAddress} onChange={(e) => set('serverAddress', e.target.value)} placeholder="play.myserver.com:8211" />}
              </Field>
              <Field label={t('"Join the server" button link')} help={t('Usually the page explaining how to join')} error={f('joinUrl')}>
                {(id) => <Input id={id} value={site.joinUrl} onChange={(e) => set('joinUrl', e.target.value)} placeholder="/p/join" className="font-mono" />}
              </Field>
              <Field label={t('Discord link')} error={f('discordUrl')}>
                {(id) => <Input id={id} value={site.discordUrl} onChange={(e) => set('discordUrl', e.target.value)} placeholder="https://discord.gg/…" />}
              </Field>
              <Field label={t('Footer text')} error={f('footerText')}>
                {(id) => <Input id={id} value={site.footerText} onChange={(e) => set('footerText', e.target.value)} />}
              </Field>
            </div>
          </div>
        </Card>

        <Card title={t('Player registration')}>
          <div className="space-y-4">
            <Toggle
              checked={site.registration.steam}
              onChange={(v) => set('registration', { ...site.registration, steam: v })}
              label={t('Steam login')}
              description={t('The account is approved and linked to the character automatically')}
            />
            <Toggle
              checked={site.registration.email}
              onChange={(v) => set('registration', { ...site.registration, email: v })}
              label={t('Email sign-up')}
              description={t('The account must be approved by an administrator (Members section)')}
            />
            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/40">
              <p className="text-sm font-medium">
                {t('Steam Web API key')} <Badge tone={steamApiKeySet ? 'green' : 'slate'}>{steamApiKeySet ? t('set') : t('optional')}</Badge>
              </p>
              <p className="mt-1 text-xs text-slate-500">{t('Fetches the Steam name and avatar on sign-up. Get one at steamcommunity.com/dev/apikey.')}</p>
              <div className="mt-3 flex gap-2">
                <Input
                  type="password"
                  value={steamKey}
                  onChange={(e) => setSteamKey(e.target.value)}
                  placeholder={steamApiKeySet ? t('•••••••• (leave empty to remove)') : t('Steam API key')}
                />
                <Button variant="secondary" onClick={() => void saveSteamKey()}>
                  {t('Save')}
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
    { id: 'public', title: 'Public site' },
    { id: 'site', title: 'Website' },
    { id: 'server', title: 'Server' },
  ];
  return (
    <>
      <PageHeader title={t('Modules')} description={t('Turn the features of the site on or off. New modules come with updates.')} />
      <div className="space-y-6">
        {areas.map((a) => (
          <Card key={a.id} title={t(a.title)}>
            <ul className="space-y-4">
              {data
                .filter((m) => m.area === a.id)
                .map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-4">
                    <Toggle
                      checked={m.enabled}
                      onChange={(v) => void toggle(m, v)}
                      disabled={!m.toggleable}
                      label={t(m.name)}
                      description={m.toggleable ? t(m.description) : t('{description} (always on)', { description: t(m.description) })}
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

// Members

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
  active: { text: 'Active', tone: 'green' },
  pending: { text: 'Waiting', tone: 'amber' },
  rejected: { text: 'Refused', tone: 'slate' },
  banned: { text: 'Banned', tone: 'red' },
};

function PlayerPicker({ players, value, onChange, hint }: { players: KnownPlayer[]; value: string; onChange: (v: string) => void; hint: string | null }) {
  const sorted = hint
    ? [...players].sort((a, b) => Number(b.name.toLowerCase() === hint.toLowerCase()) - Number(a.name.toLowerCase() === hint.toLowerCase()))
    : players;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-56">
      <option value="">— {t('No character')} —</option>
      {sorted.map((p) => (
        <option key={p.uid} value={p.uid}>
          {p.name} ({t('lvl {level}', { level: p.level })}){hint && p.name.toLowerCase() === hint.toLowerCase() ? ' ✓' : ''}
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
        if (!window.confirm(t('Delete the account "{name}" for good?', { name: m.username }))) return;
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
      <PageHeader title={t('Members')} description={t('Player accounts of the site. Email sign-ups must be approved here.')} />
      <div className="mb-4 flex gap-2">
        {(['pending', 'all'] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={cx('rounded-lg px-4 py-2 text-sm font-medium', tab === tb ? 'bg-accent text-accent-fg' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800')}
          >
            {tb === 'pending' ? t('To approve') : t('All members')}
          </button>
        ))}
      </div>
      {msg && <Alert kind="error" className="mb-4">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Empty>{tab === 'pending' ? t('No sign-up waiting.') : t('No member.')}</Empty>
      ) : (
        <div className="space-y-3">
          {data.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-48 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {m.displayName}
                    <span className="text-sm font-normal text-slate-500">@{m.username}</span>
                    <Badge tone={STATUS[m.status].tone}>{t(STATUS[m.status].text)}</Badge>
                    {m.role !== 'player' && <Badge tone="accent">{m.role === 'superadmin' ? t('Main admin') : t('Admin')}</Badge>}
                    {!!m.steam && (
                      <Badge tone="blue">
                        <Gamepad2 className="h-3 w-3" /> Steam
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.email ?? t('no email')} · {t('signed up on {date}', { date: formatDate(m.createdAt) })}
                    {m.lastLoginAt && ` · ${t('seen {when}', { when: timeAgo(m.lastLoginAt) })}`}
                  </p>
                  <p className="mt-1 text-sm">
                    {t('Declared in-game name:')} <strong>{m.inGameName ?? '—'}</strong>
                    {m.playerName && (
                      <>
                        {' '}
                        · {t('Linked character:')} <strong>{m.playerName}</strong> ({t('lvl {level}', { level: m.playerLevel })})
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
                          <Check className="h-4 w-4" /> {t('Approve')}
                        </Button>
                        <Button variant="secondary" onClick={() => void act(m, 'reject')}>
                          <X className="h-4 w-4" /> {t('Refuse')}
                        </Button>
                      </>
                    )}
                    {m.status === 'active' && !m.steam && (
                      <Button variant="secondary" onClick={() => void act(m, 'link', { playerUid: pick(m) || null })}>
                        <Link2 className="h-4 w-4" /> {t('Link')}
                      </Button>
                    )}
                    {m.status === 'active' && (
                      <Button variant="ghost" onClick={() => void act(m, 'ban')} title={t('Ban from the site')}>
                        <Ban className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                    {(m.status === 'banned' || m.status === 'rejected') && (
                      <Button variant="secondary" onClick={() => void act(m, 'unban')}>
                        {t('Reactivate')}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => void act(m, 'delete')} title={t('Delete')}>
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
        <p className="mt-4 text-xs text-slate-500">{t('No known character yet: they show up after their first time on the server.')}</p>
      )}
    </>
  );
}
