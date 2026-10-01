import { useEffect, useState } from 'react';
import { MousePointerClick, Plus, Save, Send, Shield, Trash2, Upload } from 'lucide-react';
import { PERMISSION_GROUPS, PERMISSIONS, type Permission } from '@palcms/shared';
import { api, errorText } from '../lib/api';
import * as format from '../lib/format';
import * as ui from '../components/ui';
import { ImageField } from '../components/ImageField';
import { useApp } from '../lib/app';
import { useLoad } from '../lib/useLoad';
import { useMapData } from './components';
import { LiveMap, POI_ICONS, type MapData, type MapPoi } from './map/LiveMap';
import { gameToWorld, worldToGame } from '@palcms/shared';
import { applyTheme, FONTS, type ThemeSettings } from './theme';
import { InstalledThemes } from './admin-extensions';
import { t } from '../lib/i18n';

const { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle, cx } = ui;

type Msg = { kind: 'success' | 'error'; text: string } | null;

// Map

const OFFICIAL_BOUNDS: MapData['settings']['bounds'] = [349400, 724400, -1099400, -724400];

export function MapAdminPage() {
  const { boot } = useApp();
  const { data, players, error, reload, setData } = useMapData('admin');
  const [draft, setDraft] = useState<Omit<MapPoi, 'id'> & { id?: number }>({ label: '', description: '', icon: 'pin', color: '#f59e0b', x: 0, y: 0 });
  const [placing, setPlacing] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [uploading, setUploading] = useState(false);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;
  const s = data.settings;
  const game = worldToGame(draft.x, draft.y);

  const saveSettings = async (next: MapData['settings']) => {
    setMsg(null);
    try {
      const saved = await api.put<MapData['settings']>('features/map/settings', next);
      setData({ ...data, settings: saved });
      setMsg({ kind: 'success', text: t('Map updated.') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const settings = (await api.upload('features/map/image', file)) as unknown as MapData['settings'];
      setData({ ...data, settings });
      setMsg({ kind: 'success', text: t('Image uploaded and used as the map.') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setUploading(false);
    }
  };

  const savePoi = async () => {
    setMsg(null);
    try {
      const body = { label: draft.label, description: draft.description, icon: draft.icon, color: draft.color, x: draft.x, y: draft.y };
      if (draft.id) await api.put(`features/map/poi/${draft.id}`, body);
      else await api.post('features/map/poi', body);
      setDraft({ label: '', description: '', icon: 'pin', color: '#f59e0b', x: 0, y: 0 });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <>
      <PageHeader
        title={t('Map')}
        description={boot.modules.map ? t('The map is visible to everyone at /map.') : t('The map is hidden from the public (Modules > Live map).')}
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-2">
          {placing && (
            <Alert kind="info">
              <MousePointerClick className="mr-1 inline h-4 w-4" /> {t('Click the map to place the point.')}
            </Alert>
          )}
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
            <LiveMap
              data={data}
              players={players}
              height={620}
              onMapClick={
                placing
                  ? (w) => {
                      setDraft((d) => ({ ...d, x: Math.round(w.x), y: Math.round(w.y) }));
                      setPlacing(false);
                    }
                  : undefined
              }
              onPoiClick={(p) => setDraft(p)}
            />
          </div>
        </div>

        <div className="space-y-6">
          <Card title={draft.id ? t('Edit the point') : t('New point of interest')}>
            <div className="space-y-3">
              <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={t('Name (e.g. Spawn, Shop…)')} maxLength={60} />
              <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t('Description (optional)')} rows={2} />
              <div className="flex flex-wrap gap-1">
                {Object.entries(POI_ICONS).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDraft({ ...draft, icon: k })}
                    className={cx('rounded-lg p-1.5 text-lg', draft.icon === k ? 'bg-accent/20 ring-2 ring-accent' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}
                  >
                    {v}
                  </button>
                ))}
                <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="h-9 w-10 cursor-pointer bg-transparent" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('X (in game)')}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      value={game.x}
                      onChange={(e) => setDraft({ ...draft, ...gameToWorld(Number(e.target.value), game.y) })}
                    />
                  )}
                </Field>
                <Field label={t('Y (in game)')}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      value={game.y}
                      onChange={(e) => setDraft({ ...draft, ...gameToWorld(game.x, Number(e.target.value)) })}
                    />
                  )}
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setPlacing(true)}>
                  <MousePointerClick className="h-4 w-4" /> {t('Place on the map')}
                </Button>
                <Button onClick={() => void savePoi()} disabled={!draft.label.trim()}>
                  <Save className="h-4 w-4" /> {draft.id ? t('Save') : t('Add')}
                </Button>
                {draft.id && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void api.del(`features/map/poi/${draft.id}`).then(() => {
                        setDraft({ label: '', description: '', icon: 'pin', color: '#f59e0b', x: 0, y: 0 });
                        reload();
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card title={t('Map image')}>
            <div className="space-y-3 text-sm">
              {(
                [
                  ['official', t('Official Palworld map'), t('Shipped with PalCMS (© Pocketpair).')],
                  ['custom', t('Uploaded image'), s.customUrl ? t('Your own image.') : t('Upload an image below.')],
                  ['neutral', t('Neutral map'), t('Plain grid, no image.')],
                ] as const
              ).map(([id, label, help]) => (
                <label key={id} className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="map-image"
                    checked={s.image === id}
                    disabled={id === 'custom' && !s.customUrl}
                    onChange={() => void saveSettings({ ...s, image: id })}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-slate-500">{help}</span>
                  </span>
                </label>
              ))}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-medium hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">
                <Upload className="h-4 w-4" /> {uploading ? t('Uploading…') : t('Upload an image (25 MB max)')}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} />
              </label>
              <details>
                <summary className="cursor-pointer text-xs text-slate-500">{t('Calibration (advanced)')}</summary>
                <p className="mt-2 text-xs text-slate-500">
                  {t('World coordinates of the image edges [maxX, maxY, minX, minY]. The default values match the official map, at any resolution.')}
                </p>
                <Input
                  className="mt-2 font-mono text-xs"
                  defaultValue={s.bounds.join(', ')}
                  onBlur={(e) => {
                    const b = e.target.value.split(',').map((v) => Number(v.trim()));
                    if (b.length === 4 && b.every(Number.isFinite)) void saveSettings({ ...s, bounds: b as MapData['settings']['bounds'] });
                  }}
                />
                <Button variant="ghost" className="mt-1" onClick={() => void saveSettings({ ...s, bounds: OFFICIAL_BOUNDS })}>
                  {t('Reset')}
                </Button>
              </details>
            </div>
          </Card>

          <Card title={t('Points of interest ({count})', { count: data.pois.length })}>
            {data.pois.length === 0 ? (
              <Empty>{t('No point.')}</Empty>
            ) : (
              <ul className="space-y-1">
                {data.pois.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setDraft(p)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                      {POI_ICONS[p.icon] ?? '📍'} {p.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

// Themes

export function ThemesPage() {
  const { data, error } = useLoad<ThemeSettings>('features/theme');
  const [th, setTh] = useState<ThemeSettings | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    if (data) setTh(data);
  }, [data]);
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!th) return <Spinner />;

  const update = (patch: Partial<ThemeSettings>) => {
    const next = { ...th, ...patch };
    setTh(next);
    applyTheme(next);
  };
  const save = async () => {
    setMsg(null);
    try {
      await api.put('features/theme', th);
      setMsg({ kind: 'success', text: t('Theme saved.') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <>
      <PageHeader
        title={t('Themes')}
        description={t('Pick an installed theme, then fine-tune the advanced settings: they add to the colors of "Appearance". The preview is instant; remember to save.')}
        actions={
          <Button onClick={() => void save()}>
            <Save className="h-4 w-4" /> {t('Save')}
          </Button>
        }
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <InstalledThemes />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('Font and background')}>
          <div className="space-y-4">
            <Field label={t('Site font')}>
              {(id) => (
                <Select id={id} value={th.font} onChange={(e) => update({ font: e.target.value as ThemeSettings['font'] })}>
                  {FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f === 'system' ? t('System font') : f}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('Page background')}>
              {(id) => (
                <Select id={id} value={th.background} onChange={(e) => update({ background: e.target.value as ThemeSettings['background'] })}>
                  <option value="plain">{t('Plain')}</option>
                  <option value="gradient">{t('Main color gradient')}</option>
                  <option value="dots">{t('Dot pattern')}</option>
                  <option value="image">{t('Image')}</option>
                </Select>
              )}
            </Field>
            {th.background === 'image' && (
              <Field label={t('Background image')}>{() => <ImageField value={th.backgroundImage} onChange={(v) => update({ backgroundImage: v })} previewClass="h-16 w-28" />}</Field>
            )}
            <Toggle checked={th.glass} onChange={(v) => update({ glass: v })} label={t('Glass effect')} description={t('Semi-transparent, blurred cards.')} />
          </div>
        </Card>
        <Card title={t('Custom CSS')}>
          <Textarea
            value={th.customCss}
            onChange={(e) => update({ customCss: e.target.value })}
            rows={14}
            className="font-mono text-xs"
            placeholder={'/* Example */\nh1 { letter-spacing: -0.02em; }'}
          />
          <p className="mt-2 text-xs text-slate-500">{t('Applied to the whole public site. For advanced users.')}</p>
        </Card>
      </div>
    </>
  );
}

// Discord

interface DiscordData {
  webhookUrl: string;
  configured: boolean;
  events: { server: boolean; schedule: boolean; content: boolean; alerts?: boolean };
}

export function DiscordPage() {
  const { data, error, reload } = useLoad<DiscordData>('features/discord');
  const [form, setForm] = useState<DiscordData | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!form) return <Spinner />;

  const run = async (fn: () => Promise<unknown>, text: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'success', text: t(text) });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <>
      <PageHeader title="Discord" description={t('Notifications sent automatically to a channel of your Discord server.')} />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <Card>
        <div className="space-y-5">
          <Field
            label={t('Webhook link')}
            help={t('On Discord: Channel settings > Integrations > Webhooks > New webhook > Copy URL.')}
          >
            {(id) => (
              <Input
                id={id}
                value={form.webhookUrl}
                onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                placeholder="https://discord.com/api/webhooks/…"
                className="font-mono text-xs"
              />
            )}
          </Field>
          <div className="space-y-3">
            <Toggle
              checked={form.events.server}
              onChange={(v) => setForm({ ...form, events: { ...form.events, server: v } })}
              label={t('Start, stop, crash')}
              description={t('Server online or offline, with automatic crash detection.')}
            />
            <Toggle
              checked={form.events.schedule}
              onChange={(v) => setForm({ ...form, events: { ...form.events, schedule: v } })}
              label={t('Restarts and backups')}
              description={t('Warnings before a scheduled restart, result of restarts and of manual backups.')}
            />
            <Toggle
              checked={form.events.content}
              onChange={(v) => setForm({ ...form, events: { ...form.events, content: v } })}
              label={t('News, members and reports')}
              description={t('New article published, new sign-up to approve, new report or suggestion.')}
            />
            <Toggle
              checked={form.events.alerts ?? true}
              onChange={(v) => setForm({ ...form, events: { ...form.events, alerts: v } })}
              label={t('Alerts')}
              description={t('Low FPS, memory or disk almost full, API unreachable, suspected cheating, new PalCMS version.')}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run(() => api.put('features/discord', form), 'Discord settings saved.')}>
              <Save className="h-4 w-4" /> {t('Save')}
            </Button>
            <Button variant="secondary" disabled={!data?.configured} onClick={() => void run(() => api.post('features/discord/test'), 'Test message sent.')}>
              <Send className="h-4 w-4" /> {t('Send a test')}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

// Team and roles

interface Role {
  id: number;
  name: string;
  builtin: boolean;
  permissions: Permission[];
  all: boolean;
  members: number;
}
interface TeamData {
  roles: Role[];
  staff: { id: number; username: string; displayName: string; role: string; roleId: number | null; roleName: string | null; lastLoginAt: number | null }[];
}

export function TeamPage() {
  const { boot } = useApp();
  const { data, error, reload } = useLoad<TeamData>('features/team');
  const [editing, setEditing] = useState<{ id?: number; name: string; permissions: Permission[]; builtin?: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [candidates, setCandidates] = useState<{ id: number; username: string; displayName: string }[]>([]);
  const [addRole, setAddRole] = useState<number | ''>('');
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    if (q.length < 2) return setCandidates([]);
    const timer = setTimeout(() => api.get<typeof candidates>(`features/team/candidates?q=${encodeURIComponent(q)}`).then(setCandidates).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [q]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;

  const run = async (fn: () => Promise<unknown>, text?: string) => {
    setMsg(null);
    try {
      await fn();
      if (text) setMsg({ kind: 'success', text: t(text) });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  const saveRole = () =>
    editing &&
    void run(
      () => (editing.id ? api.put(`features/roles/${editing.id}`, editing) : api.post('features/roles', editing)),
      'Role saved.',
    ).then(() => setEditing(null));

  return (
    <>
      <PageHeader title={t('Team and roles')} description={t('Give site members access to the panel, with precise permissions.')} />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('Team ({count})', { count: data.staff.length })}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.displayName}</p>
                  <p className="text-xs text-slate-500">
                    @{s.username} · {s.lastLoginAt ? t('seen {when}', { when: format.timeAgo(s.lastLoginAt) }) : t('never logged in')}
                  </p>
                </div>
                {s.role === 'superadmin' ? (
                  <Badge tone="accent">{t('Main administrator')}</Badge>
                ) : (
                  <>
                    <Select
                      value={s.roleId ?? ''}
                      disabled={s.id === boot.user?.id}
                      onChange={(e) => void run(() => api.put(`features/team/${s.id}`, { roleId: Number(e.target.value) }), 'Role changed.')}
                      className="w-40"
                    >
                      {s.roleId === null && <option value="">{t('Admin (all rights)')}</option>}
                      {data.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {t(r.name)}
                        </option>
                      ))}
                    </Select>
                    {s.id !== boot.user?.id && (
                      <Button
                        variant="ghost"
                        title={t('Remove from the team')}
                        onClick={() =>
                          window.confirm(t('Remove {name} from the team? They become a regular player again.', { name: s.displayName })) &&
                          void run(() => api.put(`features/team/${s.id}`, { roleId: null }), 'Member removed from the team.')
                        }
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
            <p className="mb-2 text-sm font-medium">{t('Add a site member to the team')}</p>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search a member…')} />
            <div className="mt-2 flex gap-2">
              <Select value={addRole} onChange={(e) => setAddRole(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— {t('Role')} —</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t(r.name)}
                  </option>
                ))}
              </Select>
            </div>
            {candidates.length > 0 && (
              <ul className="mt-2 space-y-1">
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span>
                      {c.displayName} <span className="text-slate-500">@{c.username}</span>
                    </span>
                    <Button
                      variant="secondary"
                      disabled={!addRole}
                      onClick={() =>
                        void run(() => api.put(`features/team/${c.id}`, { roleId: addRole }), t('{name} joined the team.', { name: c.displayName })).then(() => {
                          setQ('');
                          setCandidates([]);
                        })
                      }
                    >
                      <Plus className="h-4 w-4" /> {t('Add')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card
          title={t('Roles')}
          actions={
            <Button variant="secondary" onClick={() => setEditing({ name: '', permissions: [] })}>
              <Plus className="h-4 w-4" /> {t('New role')}
            </Button>
          }
        >
          <ul className="space-y-2">
            {data.roles.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => !r.all && setEditing({ id: r.id, name: r.name, permissions: r.permissions, builtin: r.builtin })}
                  className={cx('w-full rounded-lg p-3 text-left ring-1 ring-slate-200 dark:ring-slate-800', !r.all && 'hover:ring-accent')}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Shield className="h-4 w-4 text-accent" /> {t(r.name)}
                    {r.builtin && <Badge>{t('Built-in')}</Badge>}
                    <span className="ml-auto text-xs text-slate-500">{t('{n} member(s)', { n: r.members })}</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{r.all ? t('All rights') : t('{n} permission(s)', { n: r.permissions.length })}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {editing && (
        <Card className="mt-6" title={editing.id ? t('Edit "{name}"', { name: t(editing.name) }) : t('New role')}>
          <div className="space-y-4">
            {!editing.builtin && (
              <Field label={t('Role name')}>{(id) => <Input id={id} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="mb-2 text-sm font-semibold">{t(g.title)}</p>
                  <div className="space-y-1.5">
                    {g.keys.map((p) => (
                      <label key={p} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1 accent-[var(--accent)]"
                          checked={editing.permissions.includes(p)}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              permissions: e.target.checked ? [...editing.permissions, p] : editing.permissions.filter((x) => x !== p),
                            })
                          }
                        />
                        {t(PERMISSIONS[p])}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRole}>
                <Save className="h-4 w-4" /> {t('Save')}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                {t('Cancel')}
              </Button>
              {editing.id && !editing.builtin && (
                <Button variant="danger" onClick={() => void run(() => api.del(`features/roles/${editing.id}`), 'Role deleted.').then(() => setEditing(null))}>
                  <Trash2 className="h-4 w-4" /> {t('Delete')}
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

// Audit log

const ACTIONS: Record<string, string> = {
  'server.start': 'started the server',
  'server.stop': 'stopped the server',
  'server.restart': 'restarted the server',
  'server.restart-planned': 'scheduled a restart',
  'server.update': 'started an update',
  'server.config': 'changed the configuration',
  'server.announce': 'sent an announcement',
  'player.kick': 'kicked',
  'player.ban': 'banned',
  'player.unban': 'unbanned',
  'backup.create': 'created a backup',
  'backup.restore': 'restored',
  'backup.delete': 'deleted the backup',
  'backup.download': 'downloaded',
  'rcon.exec': 'ran an RCON command',
  'member.approve': 'approved the member',
  'member.rejected': 'refused the member',
  'member.banned': 'banned from the site',
  'member.active': 'reactivated',
  'member.delete': 'deleted the account',
  'page.create': 'created the page',
  'page.update': 'edited the page',
  'page.delete': 'deleted the page',
  'news.create': 'created the article',
  'news.update': 'edited the article',
  'news.delete': 'deleted the article',
  'team.set-role': 'changed the role of',
  'team.remove': 'removed from the team',
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error } = useLoad<{ items: { id: number; ts: number; username: string | null; action: string; target: string | null; details: string | null }[]; pages: number }>(
    `features/audit?page=${page}&q=${encodeURIComponent(query)}`,
  );
  if (error) return <Alert kind="error">{error}</Alert>;
  return (
    <>
      <PageHeader
        title={t('Audit log')}
        description={t('Who did what in the panel (kept 180 days).')}
        actions={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQuery(q);
            }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search…')} className="w-56" />
          </form>
        }
      />
      <Card>
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty>{t('No recorded action.')}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-2 py-2 text-sm">
                <span className="w-32 shrink-0 text-xs text-slate-500">{format.formatDateTime(a.ts)}</span>
                <span className="font-medium">{a.username ?? t('System')}</span>
                <span>{ACTIONS[a.action] ? t(ACTIONS[a.action]) : a.action}</span>
                {a.target && <span className="font-medium">{a.target}</span>}
              </li>
            ))}
          </ul>
        )}
        {data && data.pages > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('Previous')}
            </Button>
            <span className="self-center text-sm">
              {page} / {data.pages}
            </span>
            <Button variant="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
              {t('Next')}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
