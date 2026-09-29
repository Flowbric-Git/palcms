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

const { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle, cx } = ui;

type Msg = { kind: 'success' | 'error'; text: string } | null;

// Carte

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
      setMsg({ kind: 'success', text: 'Carte mise à jour.' });
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
      setMsg({ kind: 'success', text: 'Image importée et utilisée comme carte.' });
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
        title="Carte"
        description={
          boot.modules.map ? 'La carte est visible par tout le monde sur /carte.' : 'La carte est masquée au public (Modules > Carte en temps réel).'
        }
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-2">
          {placing && (
            <Alert kind="info">
              <MousePointerClick className="mr-1 inline h-4 w-4" /> Clique sur la carte pour placer le point.
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
          <Card title={draft.id ? 'Modifier le point' : 'Nouveau point d’intérêt'}>
            <div className="space-y-3">
              <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Nom (ex. Spawn, Boutique…)" maxLength={60} />
              <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description (facultatif)" rows={2} />
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
                <Field label="X (en jeu)">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      value={game.x}
                      onChange={(e) => setDraft({ ...draft, ...gameToWorld(Number(e.target.value), game.y) })}
                    />
                  )}
                </Field>
                <Field label="Y (en jeu)">
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
                  <MousePointerClick className="h-4 w-4" /> Placer sur la carte
                </Button>
                <Button onClick={() => void savePoi()} disabled={!draft.label.trim()}>
                  <Save className="h-4 w-4" /> {draft.id ? 'Enregistrer' : 'Ajouter'}
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

          <Card title="Image de la carte">
            <div className="space-y-3 text-sm">
              {(
                [
                  ['official', 'Carte officielle de Palworld', 'Fournie avec PalCMS (© Pocketpair).'],
                  ['custom', 'Image importée', s.customUrl ? 'Ton image personnalisée.' : 'Importe une image ci-dessous.'],
                  ['neutral', 'Carte neutre', 'Quadrillage simple, sans image.'],
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
                <Upload className="h-4 w-4" /> {uploading ? 'Envoi…' : 'Importer une image (25 Mo max)'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} />
              </label>
              <details>
                <summary className="cursor-pointer text-xs text-slate-500">Calibration (avancé)</summary>
                <p className="mt-2 text-xs text-slate-500">
                  Coordonnées monde des bords de l’image [maxX, maxY, minX, minY]. Les valeurs par défaut correspondent à la carte officielle, à n’importe
                  quelle résolution.
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
                  Réinitialiser
                </Button>
              </details>
            </div>
          </Card>

          <Card title={`Points d’intérêt (${data.pois.length})`}>
            {data.pois.length === 0 ? (
              <Empty>Aucun point.</Empty>
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

// Thèmes

export function ThemesPage() {
  const { data, error } = useLoad<ThemeSettings>('features/theme');
  const [t, setT] = useState<ThemeSettings | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    if (data) setT(data);
  }, [data]);
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!t) return <Spinner />;

  const update = (patch: Partial<ThemeSettings>) => {
    const next = { ...t, ...patch };
    setT(next);
    applyTheme(next);
  };
  const save = async () => {
    setMsg(null);
    try {
      await api.put('features/theme', t);
      setMsg({ kind: 'success', text: 'Thème enregistré.' });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <>
      <PageHeader
        title="Thèmes avancés"
        description="S’ajoutent aux couleurs de « Apparence ». L’aperçu est immédiat ; pense à enregistrer."
        actions={
          <Button onClick={() => void save()}>
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        }
      />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Police et fond">
          <div className="space-y-4">
            <Field label="Police du site">
              {(id) => (
                <Select id={id} value={t.font} onChange={(e) => update({ font: e.target.value as ThemeSettings['font'] })}>
                  {FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f === 'system' ? 'Police du système' : f}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Fond des pages">
              {(id) => (
                <Select id={id} value={t.background} onChange={(e) => update({ background: e.target.value as ThemeSettings['background'] })}>
                  <option value="plain">Uni</option>
                  <option value="gradient">Dégradé de la couleur principale</option>
                  <option value="dots">Motif à points</option>
                  <option value="image">Image</option>
                </Select>
              )}
            </Field>
            {t.background === 'image' && (
              <Field label="Image de fond">{() => <ImageField value={t.backgroundImage} onChange={(v) => update({ backgroundImage: v })} previewClass="h-16 w-28" />}</Field>
            )}
            <Toggle checked={t.glass} onChange={(v) => update({ glass: v })} label="Effet verre" description="Cartes semi-transparentes et floutées." />
          </div>
        </Card>
        <Card title="CSS personnalisé">
          <Textarea
            value={t.customCss}
            onChange={(e) => update({ customCss: e.target.value })}
            rows={14}
            className="font-mono text-xs"
            placeholder={'/* Exemple */\nh1 { letter-spacing: -0.02em; }'}
          />
          <p className="mt-2 text-xs text-slate-500">Appliqué à tout le site public. Réservé aux utilisateurs avancés.</p>
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
      setMsg({ kind: 'success', text });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <>
      <PageHeader title="Discord" description="Notifications envoyées automatiquement sur un salon de ton serveur Discord." />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <Card>
        <div className="space-y-5">
          <Field
            label="Lien du webhook"
            help="Sur Discord : Paramètres du salon > Intégrations > Webhooks > Nouveau webhook > Copier l’URL."
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
              label="Démarrage, arrêt, crash"
              description="Serveur en ligne ou hors ligne, avec détection automatique des crashs."
            />
            <Toggle
              checked={form.events.schedule}
              onChange={(v) => setForm({ ...form, events: { ...form.events, schedule: v } })}
              label="Redémarrages et sauvegardes"
              description="Annonces avant un redémarrage programmé, résultat des redémarrages et des sauvegardes manuelles."
            />
            <Toggle
              checked={form.events.content}
              onChange={(v) => setForm({ ...form, events: { ...form.events, content: v } })}
              label="Actualités, membres et signalements"
              description="Nouvel article publié, nouvelle inscription à valider, nouveau signalement ou suggestion."
            />
            <Toggle
              checked={form.events.alerts ?? true}
              onChange={(v) => setForm({ ...form, events: { ...form.events, alerts: v } })}
              label="Alertes"
              description="FPS bas, mémoire ou disque presque pleins, API injoignable, soupçon de triche, nouvelle version de PalCMS."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run(() => api.put('features/discord', form), 'Réglages Discord enregistrés.')}>
              <Save className="h-4 w-4" /> Enregistrer
            </Button>
            <Button variant="secondary" disabled={!data?.configured} onClick={() => void run(() => api.post('features/discord/test'), 'Message de test envoyé.')}>
              <Send className="h-4 w-4" /> Envoyer un test
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

// Équipe et rôles

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
    const t = setTimeout(() => api.get<typeof candidates>(`features/team/candidates?q=${encodeURIComponent(q)}`).then(setCandidates).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;

  const run = async (fn: () => Promise<unknown>, text?: string) => {
    setMsg(null);
    try {
      await fn();
      if (text) setMsg({ kind: 'success', text });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  const saveRole = () =>
    editing &&
    void run(
      () => (editing.id ? api.put(`features/roles/${editing.id}`, editing) : api.post('features/roles', editing)),
      'Rôle enregistré.',
    ).then(() => setEditing(null));

  return (
    <>
      <PageHeader title="Équipe et rôles" description="Donne accès au panel à des membres du site, avec des permissions précises." />
      {msg && <Alert kind={msg.kind} className="mb-4">{msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Équipe (${data.staff.length})`}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.displayName}</p>
                  <p className="text-xs text-slate-500">
                    @{s.username} · {s.lastLoginAt ? `vu ${format.timeAgo(s.lastLoginAt)}` : 'jamais connecté'}
                  </p>
                </div>
                {s.role === 'superadmin' ? (
                  <Badge tone="accent">Administrateur principal</Badge>
                ) : (
                  <>
                    <Select
                      value={s.roleId ?? ''}
                      disabled={s.id === boot.user?.id}
                      onChange={(e) => void run(() => api.put(`features/team/${s.id}`, { roleId: Number(e.target.value) }), 'Rôle modifié.')}
                      className="w-40"
                    >
                      {s.roleId === null && <option value="">Admin (tous droits)</option>}
                      {data.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                    {s.id !== boot.user?.id && (
                      <Button
                        variant="ghost"
                        title="Retirer de l’équipe"
                        onClick={() =>
                          window.confirm(`Retirer ${s.displayName} de l’équipe ? Il redeviendra simple joueur.`) &&
                          void run(() => api.put(`features/team/${s.id}`, { roleId: null }), 'Membre retiré de l’équipe.')
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
            <p className="mb-2 text-sm font-medium">Ajouter un membre du site à l’équipe</p>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un membre…" />
            <div className="mt-2 flex gap-2">
              <Select value={addRole} onChange={(e) => setAddRole(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Rôle —</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
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
                        void run(() => api.put(`features/team/${c.id}`, { roleId: addRole }), `${c.displayName} a rejoint l’équipe.`).then(() => {
                          setQ('');
                          setCandidates([]);
                        })
                      }
                    >
                      <Plus className="h-4 w-4" /> Ajouter
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card
          title="Rôles"
          actions={
            <Button variant="secondary" onClick={() => setEditing({ name: '', permissions: [] })}>
              <Plus className="h-4 w-4" /> Nouveau rôle
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
                    <Shield className="h-4 w-4 text-accent" /> {r.name}
                    {r.builtin && <Badge>Prêt à l’emploi</Badge>}
                    <span className="ml-auto text-xs text-slate-500">{r.members} membre(s)</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{r.all ? 'Tous les droits' : `${r.permissions.length} permission(s)`}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {editing && (
        <Card className="mt-6" title={editing.id ? `Modifier « ${editing.name} »` : 'Nouveau rôle'}>
          <div className="space-y-4">
            {!editing.builtin && (
              <Field label="Nom du rôle">{(id) => <Input id={id} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="mb-2 text-sm font-semibold">{g.title}</p>
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
                        {PERMISSIONS[p]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRole}>
                <Save className="h-4 w-4" /> Enregistrer
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              {editing.id && !editing.builtin && (
                <Button variant="danger" onClick={() => void run(() => api.del(`features/roles/${editing.id}`), 'Rôle supprimé.').then(() => setEditing(null))}>
                  <Trash2 className="h-4 w-4" /> Supprimer
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

// Journal des actions

const ACTIONS: Record<string, string> = {
  'server.start': 'a démarré le serveur',
  'server.stop': 'a arrêté le serveur',
  'server.restart': 'a redémarré le serveur',
  'server.restart-planned': 'a programmé un redémarrage',
  'server.update': 'a lancé une mise à jour',
  'server.config': 'a modifié la configuration',
  'server.announce': 'a envoyé une annonce',
  'player.kick': 'a expulsé',
  'player.ban': 'a banni',
  'player.unban': 'a débanni',
  'backup.create': 'a créé une sauvegarde',
  'backup.restore': 'a restauré',
  'backup.delete': 'a supprimé la sauvegarde',
  'backup.download': 'a téléchargé',
  'rcon.exec': 'a lancé une commande RCON',
  'member.approve': 'a validé le membre',
  'member.rejected': 'a refusé le membre',
  'member.banned': 'a banni du site',
  'member.active': 'a réactivé',
  'member.delete': 'a supprimé le compte',
  'page.create': 'a créé la page',
  'page.update': 'a modifié la page',
  'page.delete': 'a supprimé la page',
  'news.create': 'a créé l’article',
  'news.update': 'a modifié l’article',
  'news.delete': 'a supprimé l’article',
  'team.set-role': 'a changé le rôle de',
  'team.remove': 'a retiré de l’équipe',
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
        title="Journal des actions"
        description="Qui a fait quoi dans le panel (conservé 180 jours)."
        actions={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQuery(q);
            }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="w-56" />
          </form>
        }
      />
      <Card>
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty>Aucune action enregistrée.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-2 py-2 text-sm">
                <span className="w-32 shrink-0 text-xs text-slate-500">{format.formatDateTime(a.ts)}</span>
                <span className="font-medium">{a.username ?? 'Système'}</span>
                <span>{ACTIONS[a.action] ?? a.action}</span>
                {a.target && <span className="font-medium">{a.target}</span>}
              </li>
            ))}
          </ul>
        )}
        {data && data.pages > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Précédent
            </Button>
            <span className="self-center text-sm">
              {page} / {data.pages}
            </span>
            <Button variant="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
              Suivant
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
