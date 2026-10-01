import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CalendarClock, Download, History, Megaphone, Play, Plus, RotateCw, Save, ShieldCheck, Terminal, Trash2, UserX } from 'lucide-react';
import { api, errorText, url } from '../lib/api';
import * as format from '../lib/format';
import * as ui from '../components/ui';
import { useLiveServer } from '../lib/live';
import { useLoad } from '../lib/useLoad';
import { t } from '../lib/i18n';

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
      if (success) setMsg({ kind: 'success', text: t(success) });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  return { busy, msg, run, setMsg };
}

const bytes = (n: number) =>
  n > 1024 * 1024 ? t('{n} MB', { n: (n / 1024 / 1024).toFixed(1) }) : t('{n} KB', { n: Math.max(1, Math.round(n / 1024)) });

// Backups

interface BackupsData {
  settings: { enabled: boolean; intervalMinutes: number; keep: number };
  running: boolean;
  lastAt: number;
  items: { name: string; size: number; createdAt: number; tag: string }[];
}

const TAGS: Record<string, { label: string; tone: 'slate' | 'blue' | 'amber' | 'accent' }> = {
  auto: { label: 'Automatic', tone: 'slate' },
  manual: { label: 'Manual', tone: 'accent' },
  prerestart: { label: 'Before restart', tone: 'blue' },
  preupdate: { label: 'Before update', tone: 'blue' },
  prerestore: { label: 'Before restore', tone: 'amber' },
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
    if (!window.confirm(t('Restore "{name}"?\n\nThe server will be stopped, the current world backed up then replaced, and the server restarted.', { name }))) return;
    void a.run(name, () => api.post(`features/backups/${encodeURIComponent(name)}/restore`), 'World restored. A backup of the previous state was created.').then(reload);
  };
  const remove = (name: string) => {
    if (!window.confirm(t('Delete "{name}" for good?', { name }))) return;
    void a.run(name, () => api.del(`features/backups/${encodeURIComponent(name)}`)).then(reload);
  };

  return (
    <>
      <PageHeader
        title={t('Backups')}
        description={t('Archives of the world (SaveGames) and of the configuration, stored on the VPS.')}
        actions={
          <Button loading={a.busy === 'create'} onClick={() => void a.run('create', () => api.post('features/backups'), 'Backup created.').then(reload)}>
            <Save className="h-4 w-4" /> {t('Back up now')}
          </Button>
        }
      />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card title={t('Backups ({count})', { count: data.items.length })}>
          {data.items.length === 0 ? (
            <Empty>{t('No backup yet.')}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map((b) => (
                <li key={b.name} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{format.formatDateTime(b.createdAt)}</p>
                    <p className="truncate font-mono text-xs text-slate-500">{b.name}</p>
                  </div>
                  <Badge tone={TAGS[b.tag]?.tone ?? 'slate'}>{TAGS[b.tag] ? t(TAGS[b.tag].label) : b.tag}</Badge>
                  <span className="w-16 text-right text-xs text-slate-500">{bytes(b.size)}</span>
                  <a
                    href={url(`api/features/backups/${encodeURIComponent(b.name)}/download`)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title={t('Download')}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <Button variant="secondary" loading={a.busy === b.name} onClick={() => restore(b.name)}>
                    <History className="h-4 w-4" /> {t('Restore')}
                  </Button>
                  <button onClick={() => remove(b.name)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title={t('Delete')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('Automatic backups')} className="h-fit">
          <div className="space-y-4">
            <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={t('Enabled')} />
            <Field label={t('Frequency')}>
              {(id) => (
                <Select id={id} value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })}>
                  {[15, 30, 60, 120, 180, 360, 720, 1440].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? t('Every {n} min', { n: m }) : m === 60 ? t('Every hour') : m === 1440 ? t('Every day') : t('Every {n} h', { n: m / 60 })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('Automatic backups kept')} help={t('The oldest ones are deleted. Manual backups are always kept.')}>
              {(id) => <Input id={id} type="number" min={1} max={500} value={form.keep} onChange={(e) => setForm({ ...form, keep: Number(e.target.value) })} />}
            </Field>
            <p className="text-xs text-slate-500">{t('Last backup: {when}', { when: data.lastAt ? format.timeAgo(data.lastAt) : t('never') })}</p>
            <Button
              variant="secondary"
              loading={a.busy === 'settings'}
              onClick={() => void a.run('settings', () => api.put('features/backups/settings', form), 'Settings saved.').then(reload)}
            >
              {t('Save')}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

// Schedules (restarts, updates)

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
    const timer = setInterval(reload, 10_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data || !form) return <Spinner />;

  const save = () => void a.run('save', () => api.put('features/schedules', form), 'Schedule saved.').then(reload);
  const now = (update: boolean) => {
    const when = delay === 0 ? t('Right now') : t('In {n} minute(s)', { n: delay });
    const what = update ? t('update and restart the server?') : t('restart the server?');
    if (!window.confirm(`${when}: ${what} ${t('A backup is made just before.')}`)) return;
    void a.run(update ? 'update' : 'restart', () => api.post('features/schedules/restart-now', { delayMinutes: delay, update }), 'Scheduled.').then(reload);
  };

  return (
    <>
      <PageHeader title={t('Schedules')} description={t('Automatic restarts with in-game announcements, and server updates through SteamCMD.')} />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      {data.pending && (
        <Alert kind="warning" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {data.pending.update ? t('Update and restart planned at') : t('Restart planned at')} <strong>{format.formatDateTime(data.pending.at)}</strong>.
            </span>
            <Button variant="secondary" onClick={() => void a.run('cancel', () => api.del('features/schedules/pending'), 'Restart cancelled.').then(reload)}>
              {t('Cancel')}
            </Button>
          </div>
        </Alert>
      )}
      {data.busy && <Alert className="mb-4">{t('Restart or update in progress…')}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> {t('Scheduled restarts')}
            </span>
          }
        >
          <div className="space-y-4">
            <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={t('Enabled')} description={data.next ? t('Next: {date}', { date: format.formatDateTime(data.next) }) : undefined} />
            <div>
              <p className="mb-2 text-sm font-medium">{t('Times (VPS time)')}</p>
              <div className="flex flex-wrap gap-2">
                {form.times.map((time) => (
                  <span key={time} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm dark:bg-slate-800">
                    {time}
                    <button
                      onClick={() => setForm({ ...form, times: form.times.filter((x) => x !== time) })}
                      aria-label={t('Remove {name}', { name: time })}
                      className="text-slate-400 hover:text-red-500"
                    >
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
            <Field label={t('Announcements before the restart (minutes)')} help={t('E.g. 15, 5, 1')}>
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
            <Field label={t('In-game message')} help={t('{min} is replaced by the number of minutes', { min: '{min}' })}>
              {(id) => <Input id={id} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />}
            </Field>
            <Toggle
              checked={form.updateOnRestart}
              onChange={(v) => setForm({ ...form, updateOnRestart: v })}
              label={t('Update the server on every scheduled restart')}
              description={t('Downloads the latest Palworld version through SteamCMD (quick when already up to date).')}
            />
            <Button onClick={save} loading={a.busy === 'save'}>
              {t('Save')}
            </Button>
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <RotateCw className="h-4 w-4" /> {t('Now')}
            </span>
          }
        >
          <div className="space-y-4">
            <Field label={t('Delay (players are warned in game)')}>
              {(id) => (
                <Select id={id} value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
                  <option value={0}>{t('Right now')}</option>
                  <option value={1}>{t('In 1 minute')}</option>
                  <option value={5}>{t('In {n} minutes', { n: 5 })}</option>
                  <option value={15}>{t('In {n} minutes', { n: 15 })}</option>
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={a.busy === 'restart'} onClick={() => now(false)} disabled={!!data.pending || data.busy}>
                <RotateCw className="h-4 w-4" /> {t('Restart')}
              </Button>
              <Button loading={a.busy === 'update'} onClick={() => now(true)} disabled={!!data.pending || data.busy}>
                <Download className="h-4 w-4" /> {t('Update and restart')}
              </Button>
            </div>
            <p className="text-xs text-slate-500">{t('A backup is always made before a restart or an update.')}</p>
          </div>
        </Card>
      </div>
    </>
  );
}

// In-game announcements

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
    void a.run('now', () => api.post('features/announce', { message }), 'Announcement sent to online players.').then(() => setMessage(''));
  };
  const plan = (e: FormEvent) => {
    e.preventDefault();
    void a
      .run('plan', () => api.post('features/announcements', { ...planned, runAt: new Date(planned.runAt).getTime() }), 'Announcement scheduled.')
      .then(() => {
        setPlanned((p) => ({ ...p, message: '' }));
        reload();
      });
  };
  const REPEAT = { none: t('Once'), hourly: t('Every hour'), daily: t('Every day') };

  return (
    <>
      <PageHeader title={t('In-game announcements')} description={t('Messages shown to every online player.')} />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> {t('Send now')}
            </span>
          }
        >
          <form onSubmit={sendNow} className="space-y-3">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder={t('E.g. Boss event at spawn in 10 minutes!')} />
            <Button type="submit" loading={a.busy === 'now'} disabled={!message.trim()}>
              <Play className="h-4 w-4" /> {t('Send')}
            </Button>
          </form>
        </Card>
        <Card
          title={
            <span className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> {t('Schedule')}
            </span>
          }
        >
          <form onSubmit={plan} className="space-y-3">
            <Input value={planned.message} onChange={(e) => setPlanned({ ...planned, message: e.target.value })} maxLength={200} placeholder={t('Message')} />
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
              <Plus className="h-4 w-4" /> {t('Schedule')}
            </Button>
          </form>
        </Card>
      </div>
      <Card title={t('Scheduled announcements')} className="mt-6">
        {!data ? (
          <Spinner />
        ) : data.length === 0 ? (
          <Empty>{t('No scheduled announcement.')}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.message}</p>
                  <p className="text-xs text-slate-500">
                    {format.formatDateTime(n.runAt)} · {REPEAT[n.repeat]} · {t('by {name}', { name: n.createdBy })}
                  </p>
                </div>
                <button
                  onClick={() => void a.run(`del${n.id}`, () => api.del(`features/announcements/${n.id}`)).then(reload)}
                  className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                  title={t('Delete')}
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

// Moderation

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
    const message = window.prompt(t('Kick {name}? Message shown:', { name: p.name }), t('Kicked by an administrator'));
    if (message === null) return;
    void a.run(`kick${p.uid}`, () => api.post(`features/players/${encodeURIComponent(p.uid)}/kick`, { message }), t('{name} was kicked.', { name: p.name })).then(players.reload);
  };
  const ban = (p: { uid: string; name: string }) => {
    const reason = window.prompt(t('Ban {name}? Reason:', { name: p.name }), '');
    if (reason === null) return;
    void a
      .run(`ban${p.uid}`, () => api.post(`features/players/${encodeURIComponent(p.uid)}/ban`, { reason }), t('{name} was banned.', { name: p.name }))
      .then(() => {
        players.reload();
        bans.reload();
      });
  };

  return (
    <>
      <PageHeader title={t('Moderation')} description={t('Kicks, bans and whitelist of the Palworld server.')} />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('Players online ({count})', { count: players.data?.online.length ?? 0 })}>
          {!players.data ? (
            <Spinner />
          ) : players.data.online.length === 0 ? (
            <Empty>{t('No player online.')}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {players.data.online.map((p) => (
                <li key={p.uid} className="flex items-center gap-2 py-2">
                  <span className="flex-1 text-sm font-medium">
                    {p.name} <span className="text-xs text-slate-500">{t('lvl {level}', { level: p.level })} · {p.ping} ms</span>
                  </span>
                  <Button variant="secondary" loading={a.busy === `kick${p.uid}`} onClick={() => kick(p)}>
                    <UserX className="h-4 w-4" /> {t('Kick')}
                  </Button>
                  <Button variant="danger" loading={a.busy === `ban${p.uid}`} onClick={() => ban(p)}>
                    <Ban className="h-4 w-4" /> {t('Ban')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('Banned ({count})', { count: bans.data?.length ?? 0 })}>
          {!bans.data ? (
            <Spinner />
          ) : bans.data.length === 0 ? (
            <Empty>{t('No banned player.')}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {bans.data.map((b) => (
                <li key={b.uid} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-slate-500">
                      {b.reason || t('No reason')} · {t('by {name}', { name: b.bannedBy })} · {format.formatDate(b.bannedAt)}
                    </p>
                    {b.expiresAt && <Badge tone="amber">{t('Until {date}', { date: format.formatDateTime(b.expiresAt) })}</Badge>}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void a.run(`unban${b.uid}`, () => api.del(`features/bans/${encodeURIComponent(b.uid)}`), t('{name} was unbanned.', { name: b.name })).then(bans.reload)}
                  >
                    {t('Unban')}
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
            <ShieldCheck className="h-4 w-4" /> {t('Whitelist')}
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
                label={t('Enable the whitelist')}
                description={t('Any player missing from the list is kicked as soon as they join.')}
              />
              <Field label={t('Kick message')}>
                {(id) => <Input id={id} value={wlForm.message} onChange={(e) => setWlForm({ ...wlForm, message: e.target.value })} />}
              </Field>
              <Button variant="secondary" onClick={() => void a.run('wl', () => api.put('features/whitelist/settings', wlForm), 'Whitelist saved.').then(wl.reload)}>
                {t('Save')}
              </Button>
            </div>
            <div>
              <div className="mb-3 flex gap-2">
                <Select value={addUid} onChange={(e) => setAddUid(e.target.value)}>
                  <option value="">— {t('Add a known player')} —</option>
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
                <Empty>{t('Empty list.')}</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {wl.data.entries.map((e) => (
                    <li key={e.uid} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="flex-1">{e.name}</span>
                      <button
                        onClick={() => void a.run(`wldel${e.uid}`, () => api.del(`features/whitelist/${encodeURIComponent(e.uid)}`)).then(wl.reload)}
                        className="text-red-500"
                        aria-label={t('Remove {name}', { name: e.name })}
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

const QUICK = ['ShowPlayers', 'Info', 'Save', 'Broadcast Hello_everyone'];

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
      setHistory((h) => [...h, { cmd, out: r.output || t('(no answer)') }]);
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
      <PageHeader
        title={t('RCON console')}
        description={t('Admin commands of the Palworld server (/ShowPlayers, /Broadcast, /Save…). Every command is recorded in the audit log.')}
      />
      {a.msg && <Alert kind={a.msg.kind} className="mb-4">{a.msg.text}</Alert>}
      {!status.data.enabled && !status.data.managed ? (
        <Card>
          <p className="text-sm">
            {status.data.mode === 'none'
              ? t('No server is connected to the site.')
              : t('RCON is not set up for this external server. Turn RCON on on the server (RCONEnabled=True), then enter its port in "Server connection".')}
          </p>
          <Link to="/admin/server/connection" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent">
            <Terminal className="h-4 w-4" /> {t('Server connection')}
          </Link>
        </Card>
      ) : !status.data.enabled ? (
        <Card>
          <p className="text-sm">
            {t('RCON is off on the server. Turning it on changes the configuration and restarts the server. The RCON port stays closed to the public: only the panel uses it.')}
          </p>
          <Button className="mt-4" loading={a.busy === 'enable'} onClick={() => void a.run('enable', () => api.post('features/rcon/enable'), 'RCON on, server restarted.').then(status.reload)}>
            <Terminal className="h-4 w-4" /> {t('Turn on RCON')}
          </Button>
        </Card>
      ) : (
        <Card>
          <pre ref={ref} className="h-[50vh] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
            {history.length === 0
              ? t('Type a command below (without the "/").')
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
              {t('Send')}
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
