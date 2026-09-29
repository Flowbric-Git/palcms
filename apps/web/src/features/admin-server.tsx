import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CalendarClock, Download, History, Megaphone, Play, Plus, RotateCw, Save, ShieldCheck, Terminal, Trash2, UserX } from 'lucide-react';
import { api, errorText, url } from '../lib/api';
import * as format from '../lib/format';
import * as ui from '../components/ui';
import { useLiveServer } from '../lib/live';
import { useLoad } from '../lib/useLoad';

const { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Toggle, cx } = ui;

type Msg = { kind: 'success' | 'error'; text: string } | null;

function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (success) setMsg({ kind: 'success', text: success });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  return { busy, msg, run, setMsg };
}

const bytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

// Sauvegardes

interface BackupsData {
  settings: { enabled: boolean; intervalMinutes: number; keep: number };
  running: boolean;
  lastAt: number;
  items: { name: string; size: number; createdAt: number; tag: string }[];
}

const TAGS: Record<string, { label: string; tone: 'slate' | 'blue' | 'amber' | 'accent' }> = {
  auto: { label: 'Automatique', tone: 'slate' },
  manual: { label: 'Manuelle', tone: 'accent' },
  prerestart: { label: 'Avant redémarrage', tone: 'blue' },
  preupdate: { label: 'Avant mise à jour', tone: 'blue' },
  prerestore: { label: 'Avant restauration', tone: 'amber' },
};

export function BackupsPage() {
  const { data, error, reload } = useLoad<BackupsData>('features/backups');
  const [form, setForm] = useState<BackupsData['settings'] | null>(null);
  const a = useAction();
  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data || !form) return <Spinner />;

  const restore = (name: string) => {
    if (!window.confirm(`Restaurer « ${name} » ?\n\nLe serveur sera arrêté, le monde actuel sauvegardé puis remplacé, et le serveur redémarré.`)) return;
    void a.run(name, () => api.post(`features/backups/${encodeURIComponent(name)}/restore`), 'Monde restauré. Une sauvegarde de l’état précédent a été créée.').then(reload);
  };
  const remove = (name: string) => {
    if (!window.confirm(`Supprimer définitivement « ${name} » ?`)) return;
    void a.run(name, () => api.del(`features/backups/${encodeURIComponent(name)}`)).then(reload);
  };

  return (
    <>
      <PageHeader
        title="Sauvegardes"
        description="Archives du monde (SaveGames) et de la configuration, stockées sur le VPS."
        actions={
          <Button loading={a.busy === 'create'} onClick={() => void a.run('create', () => api.post('features/backups'), 'Sauvegarde créée.').then(reload)}>
            <Save className="h-4 w-4" /> Sauvegarder maintenant
          </Button>
        }
      />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card title={`Sauvegardes (${data.items.length})`}>
          {data.items.length === 0 ? (
            <Empty>Aucune sauvegarde pour le moment.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map((b) => (
                <li key={b.name} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{format.formatDateTime(b.createdAt)}</p>
                    <p className="truncate font-mono text-xs text-slate-500">{b.name}</p>
                  </div>
                  <Badge tone={TAGS[b.tag]?.tone ?? 'slate'}>{TAGS[b.tag]?.label ?? b.tag}</Badge>
                  <span className="w-16 text-right text-xs text-slate-500">{bytes(b.size)}</span>
                  <a
                    href={url(`api/features/backups/${encodeURIComponent(b.name)}/download`)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Télécharger"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <Button variant="secondary" loading={a.busy === b.name} onClick={() => restore(b.name)}>
                    <History className="h-4 w-4" /> Restaurer
                  </Button>
                  <button onClick={() => remove(b.name)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Supprimer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Sauvegardes automatiques" className="h-fit">
          <div className="space-y-4">
            <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Activées" />
            <Field label="Fréquence">
              {(id) => (
                <Select id={id} value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })}>
                  {[15, 30, 60, 120, 180, 360, 720, 1440].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `Toutes les ${m} min` : m === 60 ? 'Toutes les heures' : m === 1440 ? 'Tous les jours' : `Toutes les ${m / 60} h`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Nombre de sauvegardes automatiques gardées" help="Les plus anciennes sont supprimées. Les sauvegardes manuelles sont toujours conservées.">
              {(id) => <Input id={id} type="number" min={1} max={500} value={form.keep} onChange={(e) => setForm({ ...form, keep: Number(e.target.value) })} />}
            </Field>
            <p className="text-xs text-slate-500">Dernière sauvegarde : {data.lastAt ? format.timeAgo(data.lastAt) : 'jamais'}</p>
            <Button
              variant="secondary"
              loading={a.busy === 'settings'}
              onClick={() => void a.run('settings', () => api.put('features/backups/settings', form), 'Réglages enregistrés.').then(reload)}
            >
              Enregistrer
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

// Programmation (redémarrages, mises à jour)

interface ScheduleData {
  settings: { enabled: boolean; times: string[]; warnings: number[]; updateOnRestart: boolean; message: string };
  next: number | null;
  pending: { at: number; update: boolean } | null;
  busy: boolean;
}

export function SchedulesPage() {
  const { data, error, reload } = useLoad<ScheduleData>('features/schedules');
  const [form, setForm] = useState<ScheduleData['settings'] | null>(null);
  const [newTime, setNewTime] = useState('06:00');
  const [delay, setDelay] = useState(5);
  const a = useAction();
  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);
  useEffect(() => {
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data || !form) return <Spinner />;

  const save = () => void a.run('save', () => api.put('features/schedules', form), 'Programmation enregistrée.').then(reload);
  const now = (update: boolean) => {
    const what = update ? 'mettre à jour et redémarrer' : 'redémarrer';
    if (!window.confirm(`${delay === 0 ? 'Immédiatement' : `Dans ${delay} minute(s)`} : ${what} le serveur ? Une sauvegarde est faite juste avant.`)) return;
    void a.run(update ? 'update' : 'restart', () => api.post('features/schedules/restart-now', { delayMinutes: delay, update }), 'C’est programmé.').then(reload);
  };

  return (
    <>
      <PageHeader title="Programmation" description="Redémarrages automatiques avec annonces en jeu, et mises à jour du serveur via SteamCMD." />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      {data.pending && (
        <Alert kind="warning" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {data.pending.update ? 'Mise à jour et redémarrage' : 'Redémarrage'} prévu à <strong>{format.formatDateTime(data.pending.at)}</strong>.
            </span>
            <Button variant="secondary" onClick={() => void a.run('cancel', () => api.del('features/schedules/pending'), 'Redémarrage annulé.').then(reload)}>
              Annuler
            </Button>
          </div>
        </Alert>
      )}
      {data.busy && <Alert className="mb-4">Redémarrage ou mise à jour en cours…</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Redémarrages programmés
            </span>
          }
        >
          <div className="space-y-4">
            <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Activés" description={data.next ? `Prochain : ${format.formatDateTime(data.next)}` : undefined} />
            <div>
              <p className="mb-2 text-sm font-medium">Heures (heure du VPS)</p>
              <div className="flex flex-wrap gap-2">
                {form.times.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm dark:bg-slate-800">
                    {t}
                    <button onClick={() => setForm({ ...form, times: form.times.filter((x) => x !== t) })} aria-label={`Retirer ${t}`} className="text-slate-400 hover:text-red-500">
                      ×
                    </button>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1">
                  <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-32" />
                  <Button
                    variant="secondary"
                    onClick={() => newTime && !form.times.includes(newTime) && setForm({ ...form, times: [...form.times, newTime].sort() })}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            </div>
            <Field label="Annonces avant le redémarrage (minutes)" help="Ex. 15, 5, 1">
              {(id) => (
                <Input
                  id={id}
                  value={form.warnings.join(', ')}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      warnings: e.target.value
                        .split(/[,\s]+/)
                        .map(Number)
                        .filter((n) => Number.isInteger(n) && n > 0 && n <= 60),
                    })
                  }
                />
              )}
            </Field>
            <Field label="Message en jeu" help="{min} est remplacé par le nombre de minutes">
              {(id) => <Input id={id} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />}
            </Field>
            <Toggle
              checked={form.updateOnRestart}
              onChange={(v) => setForm({ ...form, updateOnRestart: v })}
              label="Mettre à jour le serveur à chaque redémarrage programmé"
              description="Télécharge la dernière version de Palworld via SteamCMD (rapide si déjà à jour)."
            />
            <Button onClick={save} loading={a.busy === 'save'}>
              Enregistrer
            </Button>
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <RotateCw className="h-4 w-4" /> Maintenant
            </span>
          }
        >
          <div className="space-y-4">
            <Field label="Délai (les joueurs sont prévenus en jeu)">
              {(id) => (
                <Select id={id} value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
                  <option value={0}>Immédiatement</option>
                  <option value={1}>Dans 1 minute</option>
                  <option value={5}>Dans 5 minutes</option>
                  <option value={15}>Dans 15 minutes</option>
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={a.busy === 'restart'} onClick={() => now(false)} disabled={!!data.pending || data.busy}>
                <RotateCw className="h-4 w-4" /> Redémarrer
              </Button>
              <Button loading={a.busy === 'update'} onClick={() => now(true)} disabled={!!data.pending || data.busy}>
                <Download className="h-4 w-4" /> Mettre à jour et redémarrer
              </Button>
            </div>
            <p className="text-xs text-slate-500">Une sauvegarde est toujours faite avant un redémarrage ou une mise à jour.</p>
          </div>
        </Card>
      </div>
    </>
  );
}

// Annonces en jeu

interface Announcement {
  id: number;
  message: string;
  runAt: number;
  repeat: 'none' | 'hourly' | 'daily';
  createdBy: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function AnnouncementsPage() {
  const { data, reload } = useLoad<Announcement[]>('features/announcements');
  const [message, setMessage] = useState('');
  const [planned, setPlanned] = useState({ message: '', runAt: localInput(new Date(Date.now() + 3600_000)), repeat: 'none' as Announcement['repeat'] });
  const a = useAction();

  const sendNow = (e: FormEvent) => {
    e.preventDefault();
    void a.run('now', () => api.post('features/announce', { message }), 'Annonce envoyée aux joueurs connectés.').then(() => setMessage(''));
  };
  const plan = (e: FormEvent) => {
    e.preventDefault();
    void a
      .run('plan', () => api.post('features/announcements', { ...planned, runAt: new Date(planned.runAt).getTime() }), 'Annonce programmée.')
      .then(() => {
        setPlanned((p) => ({ ...p, message: '' }));
        reload();
      });
  };
  const REPEAT = { none: 'Une fois', hourly: 'Toutes les heures', daily: 'Tous les jours' };

  return (
    <>
      <PageHeader title="Annonces en jeu" description="Messages affichés à tous les joueurs connectés." />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> Envoyer maintenant
            </span>
          }
        >
          <form onSubmit={sendNow} className="space-y-3">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="Ex. Événement boss dans 10 minutes au spawn !" />
            <Button type="submit" loading={a.busy === 'now'} disabled={!message.trim()}>
              <Play className="h-4 w-4" /> Envoyer
            </Button>
          </form>
        </Card>
        <Card
          title={
            <span className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Programmer
            </span>
          }
        >
          <form onSubmit={plan} className="space-y-3">
            <Input value={planned.message} onChange={(e) => setPlanned({ ...planned, message: e.target.value })} maxLength={200} placeholder="Message" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="datetime-local" value={planned.runAt} onChange={(e) => setPlanned({ ...planned, runAt: e.target.value })} />
              <Select value={planned.repeat} onChange={(e) => setPlanned({ ...planned, repeat: e.target.value as Announcement['repeat'] })}>
                {Object.entries(REPEAT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" loading={a.busy === 'plan'} disabled={!planned.message.trim()}>
              <Plus className="h-4 w-4" /> Programmer
            </Button>
          </form>
        </Card>
      </div>
      <Card title="Annonces programmées" className="mt-6">
        {!data ? (
          <Spinner />
        ) : data.length === 0 ? (
          <Empty>Aucune annonce programmée.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.message}</p>
                  <p className="text-xs text-slate-500">
                    {format.formatDateTime(n.runAt)} · {REPEAT[n.repeat]} · par {n.createdBy}
                  </p>
                </div>
                <button
                  onClick={() => void a.run(`del${n.id}`, () => api.del(`features/announcements/${n.id}`)).then(reload)}
                  className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// Modération

interface OnlinePlayer {
  uid: string;
  name: string;
  level: number;
  ping: number;
}

export function ModerationPage() {
  const players = useLoad<{ online: OnlinePlayer[]; history: { uid: string; name: string }[] }>('admin/server/players');
  const bans = useLoad<{ uid: string; name: string; reason: string; bannedAt: number; bannedBy: string; expiresAt: number | null }[]>('features/bans');
  const wl = useLoad<{ settings: { enabled: boolean; message: string }; entries: { uid: string; name: string; addedAt: number; addedBy: string }[] }>('features/whitelist');
  const [wlForm, setWlForm] = useState<{ enabled: boolean; message: string } | null>(null);
  const [addUid, setAddUid] = useState('');
  const a = useAction();
  const live = useLiveServer();
  useEffect(() => {
    if (wl.data) setWlForm(wl.data.settings);
  }, [wl.data]);
  useEffect(() => players.reload(), [live.players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const kick = (p: OnlinePlayer) => {
    const message = window.prompt(`Expulser ${p.name} ? Message affiché :`, 'Expulsé par un administrateur');
    if (message === null) return;
    void a.run(`kick${p.uid}`, () => api.post(`features/players/${encodeURIComponent(p.uid)}/kick`, { message }), `${p.name} a été expulsé.`).then(players.reload);
  };
  const ban = (p: { uid: string; name: string }) => {
    const reason = window.prompt(`Bannir ${p.name} ? Raison :`, '');
    if (reason === null) return;
    void a
      .run(`ban${p.uid}`, () => api.post(`features/players/${encodeURIComponent(p.uid)}/ban`, { reason }), `${p.name} a été banni.`)
      .then(() => {
        players.reload();
        bans.reload();
      });
  };

  return (
    <>
      <PageHeader title="Modération" description="Expulsions, bannissements et liste blanche du serveur Palworld." />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Joueurs connectés (${players.data?.online.length ?? 0})`}>
          {!players.data ? (
            <Spinner />
          ) : players.data.online.length === 0 ? (
            <Empty>Aucun joueur connecté.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {players.data.online.map((p) => (
                <li key={p.uid} className="flex items-center gap-2 py-2">
                  <span className="flex-1 text-sm font-medium">
                    {p.name} <span className="text-xs text-slate-500">niv. {p.level} · {p.ping} ms</span>
                  </span>
                  <Button variant="secondary" loading={a.busy === `kick${p.uid}`} onClick={() => kick(p)}>
                    <UserX className="h-4 w-4" /> Expulser
                  </Button>
                  <Button variant="danger" loading={a.busy === `ban${p.uid}`} onClick={() => ban(p)}>
                    <Ban className="h-4 w-4" /> Bannir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Bannis (${bans.data?.length ?? 0})`}>
          {!bans.data ? (
            <Spinner />
          ) : bans.data.length === 0 ? (
            <Empty>Aucun joueur banni.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {bans.data.map((b) => (
                <li key={b.uid} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-slate-500">
                      {b.reason || 'Sans raison'} · par {b.bannedBy} · {format.formatDate(b.bannedAt)}
                    </p>
                    {b.expiresAt && <Badge tone="amber">Jusqu’au {format.formatDateTime(b.expiresAt)}</Badge>}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void a.run(`unban${b.uid}`, () => api.del(`features/bans/${encodeURIComponent(b.uid)}`), `${b.name} a été débanni.`).then(bans.reload)}
                  >
                    Débannir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        className="mt-6"
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Liste blanche
          </span>
        }
      >
        {!wl.data || !wlForm ? (
          <Spinner />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <Toggle
                checked={wlForm.enabled}
                onChange={(v) => setWlForm({ ...wlForm, enabled: v })}
                label="Activer la liste blanche"
                description="Tout joueur absent de la liste est expulsé dès sa connexion."
              />
              <Field label="Message d’expulsion">
                {(id) => <Input id={id} value={wlForm.message} onChange={(e) => setWlForm({ ...wlForm, message: e.target.value })} />}
              </Field>
              <Button variant="secondary" onClick={() => void a.run('wl', () => api.put('features/whitelist/settings', wlForm), 'Liste blanche enregistrée.').then(wl.reload)}>
                Enregistrer
              </Button>
            </div>
            <div>
              <div className="mb-3 flex gap-2">
                <Select value={addUid} onChange={(e) => setAddUid(e.target.value)}>
                  <option value="">— Ajouter un joueur connu —</option>
                  {players.data?.history
                    .filter((h) => !wl.data!.entries.some((e) => e.uid === h.uid))
                    .map((h) => (
                      <option key={h.uid} value={h.uid}>
                        {h.name}
                      </option>
                    ))}
                </Select>
                <Button
                  variant="secondary"
                  disabled={!addUid}
                  onClick={() =>
                    void a.run('wladd', () => api.post('features/whitelist', { uid: addUid })).then(() => {
                      setAddUid('');
                      wl.reload();
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {wl.data.entries.length === 0 ? (
                <Empty>Liste vide.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {wl.data.entries.map((e) => (
                    <li key={e.uid} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="flex-1">{e.name}</span>
                      <button
                        onClick={() => void a.run(`wldel${e.uid}`, () => api.del(`features/whitelist/${encodeURIComponent(e.uid)}`)).then(wl.reload)}
                        className="text-red-500"
                        aria-label={`Retirer ${e.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// Console RCON

const QUICK = ['ShowPlayers', 'Info', 'Save', 'Broadcast Bonjour_à_tous'];

export function RconPage() {
  const status = useLoad<{ enabled: boolean; port: number; managed: boolean; mode: 'managed' | 'external' | 'none' }>('features/rcon');
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<{ cmd: string; out: string; error?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const a = useAction();
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => ref.current?.scrollTo({ top: ref.current.scrollHeight }), [history]);

  const exec = async (cmd: string) => {
    if (!cmd.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ output: string }>('features/rcon/exec', { command: cmd });
      setHistory((h) => [...h, { cmd, out: r.output || '(aucune réponse)' }]);
    } catch (e) {
      setHistory((h) => [...h, { cmd, out: errorText(e), error: true }]);
    } finally {
      setBusy(false);
      setCommand('');
    }
  };

  if (!status.data) return status.error ? <Alert kind="error">{status.error}</Alert> : <Spinner />;
  return (
    <>
      <PageHeader title="Console RCON" description="Commandes admin du serveur Palworld (/ShowPlayers, /Broadcast, /Save…). Toutes les commandes sont enregistrées dans le journal." />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      {!status.data.enabled && !status.data.managed ? (
        <Card>
          <p className="text-sm">
            {status.data.mode === 'none'
              ? 'Aucun serveur n’est connecté au site.'
              : 'RCON n’est pas configuré pour ce serveur externe. Active RCON sur le serveur (RCONEnabled=True), puis indique son port dans « Connexion au serveur ».'}
          </p>
          <Link to="/admin/serveur/connexion" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent">
            <Terminal className="h-4 w-4" /> Connexion au serveur
          </Link>
        </Card>
      ) : !status.data.enabled ? (
        <Card>
          <p className="text-sm">RCON est désactivé sur le serveur. L’activer modifie la configuration et redémarre le serveur. Le port RCON reste fermé au public : seul le panel l’utilise.</p>
          <Button className="mt-4" loading={a.busy === 'enable'} onClick={() => void a.run('enable', () => api.post('features/rcon/enable'), 'RCON activé, serveur redémarré.').then(status.reload)}>
            <Terminal className="h-4 w-4" /> Activer RCON
          </Button>
        </Card>
      ) : (
        <Card>
          <pre ref={ref} className="h-[50vh] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
            {history.length === 0
              ? 'Tape une commande ci-dessous (sans le « / »).'
              : history.map((h, i) => (
                  <div key={i} className="mb-2">
                    <span className="text-green-400">&gt; {h.cmd}</span>
                    {'\n'}
                    <span className={cx(h.error && 'text-red-400')}>{h.out}</span>
                  </div>
                ))}
          </pre>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void exec(command);
            }}
          >
            <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="ShowPlayers" className="font-mono" autoFocus />
            <Button type="submit" loading={busy}>
              Envoyer
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button key={q} onClick={() => void exec(q)} className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">
                {q}
              </button>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
