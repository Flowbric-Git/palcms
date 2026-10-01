import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, ExternalLink, Palette, Power, Puzzle, RefreshCw, Search, Settings2, ShieldAlert, ShieldCheck, Trash2, Upload } from 'lucide-react';
import type { ExtensionSettingDef, ExtensionSettingValues, ExtensionType, InstalledExtension, MarketEntry } from '@palcms/shared';
import { api, errorText, isDemo, url } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { useApp } from '../lib/app';
import { ExtensionBoundary, type ExtAdminPage } from '../lib/extensions';
import { ImageField } from '../components/ImageField';
import * as ui from '../components/ui';
import { num, t, tm } from '../lib/i18n';

const { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle, cx } = ui;

type Msg = { kind: 'success' | 'error' | 'warning'; text: string } | null;

const TYPE_LABEL: Record<ExtensionType, string> = { plugin: 'Plugin', theme: 'Theme' };
const iconSrc = (u: string | null | undefined) => (!u ? null : /^https?:\/\//.test(u) ? u : url(u));

function ExtIcon({ src, type, className = 'h-12 w-12' }: { src: string | null | undefined; type: ExtensionType; className?: string }) {
  const s = iconSrc(src);
  if (s) return <img src={s} alt="" className={cx(className, 'shrink-0 rounded-xl object-cover')} />;
  const Icon = type === 'theme' ? Palette : Puzzle;
  return (
    <span className={cx(className, 'flex shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent')}>
      <Icon className="h-1/2 w-1/2" />
    </span>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge tone="green">
      <ShieldCheck className="mr-1 inline h-3 w-3" />
      {t('Verified')}
    </Badge>
  ) : (
    <Badge tone="amber">
      <ShieldAlert className="mr-1 inline h-3 w-3" />
      {t('Not verified')}
    </Badge>
  );
}

/** Install button for a .zip file. */
function UploadButton({ onDone, onError }: { onDone: (ext: InstalledExtension) => void; onError: (m: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      onDone(await api.post<InstalledExtension>('features/extensions/upload', form));
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <>
      <input ref={ref} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <Button variant="secondary" loading={busy} onClick={() => ref.current?.click()}>
        <Upload className="h-4 w-4" /> {t('Install a .zip file')}
      </Button>
    </>
  );
}

// Market

export function MarketPage() {
  const { data, error, reload, setData } = useLoad<{ resources: MarketEntry[]; error: string | null }>('features/extensions/market');
  const [type, setType] = useState<ExtensionType | 'all'>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.resources ?? []).filter(
      (r) => (type === 'all' || r.type === type) && (!s || `${r.name} ${r.summary} ${r.author}`.toLowerCase().includes(s)),
    );
  }, [data, type, q]);

  const refresh = async () => {
    try {
      setData(await api.get('features/extensions/market?refresh=1'));
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  const install = async (r: MarketEntry) => {
    setBusy(r.id);
    setMsg(null);
    try {
      const ext = await api.post<InstalledExtension>(`features/extensions/market/${r.id}/install`);
      setMsg({
        kind: 'success',
        text:
          ext.type === 'theme'
            ? t('{name} {version} is installed. Turn it on in Website > Themes.', { name: ext.name, version: ext.version })
            : t('{name} {version} is installed. Turn it on in Plugins.', { name: ext.name, version: ext.version }),
      });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Market"
        description={t('Plugins and themes approved by the PalCMS team, ready to install in one click.')}
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> {t('Refresh')}
          </Button>
        }
      />
      {msg && (
        <Alert kind={msg.kind} className="mb-4">
          {msg.text}
        </Alert>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              ['all', t('All')],
              ['plugin', t('Plugins')],
              ['theme', t('Themes')],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setType(v)}
              className={cx(
                'rounded-md px-4 py-1.5 text-sm font-medium transition',
                type === v ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search a resource…')} className="pl-9" />
        </div>
      </div>

      {error ? (
        <Alert kind="error">{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : data.error ? (
        <Alert kind="warning">
          {tm(data.error)}. {t('Try again later, or install a .zip file from the Plugins or Themes page.')}
        </Alert>
      ) : list.length === 0 ? (
        <Empty>{data.resources.length === 0 ? t('The market has no resource yet.') : t('No resource matches.')}</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <MarketCard key={r.id} r={r} busy={busy === r.id} onInstall={() => void install(r)} />
          ))}
        </div>
      )}
    </>
  );
}

function MarketCard({ r, busy, onInstall }: { r: MarketEntry; busy: boolean; onInstall: () => void }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {r.screenshots?.[0] ? (
        <img src={r.screenshots[0]} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
          <ExtIcon src={r.iconUrl} type={r.type} className="h-16 w-16" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          {r.screenshots?.[0] && <ExtIcon src={r.iconUrl} type={r.type} className="h-10 w-10" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{r.name}</p>
            <p className="truncate text-xs text-slate-500">
              {r.author ? `${t('by {name}', { name: r.author })} · ` : ''}v{r.version}
              {r.downloads !== undefined ? ` · ${t('{n} downloads', { n: num(r.downloads) })}` : ''}
            </p>
          </div>
          <Badge tone={r.type === 'theme' ? 'blue' : 'accent'}>{t(TYPE_LABEL[r.type])}</Badge>
        </div>
        <p className="mt-3 line-clamp-3 flex-1 text-sm text-slate-600 dark:text-slate-400">{r.summary}</p>
        <div className="mt-4 flex items-center gap-2">
          {!r.compatible ? (
            <Badge tone="red">{t('Needs PalCMS {version}', { version: r.palcms })}</Badge>
          ) : r.installed && !r.update ? (
            <span className="flex items-center gap-1 text-sm font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" /> {t('Installed')}
            </span>
          ) : (
            <Button loading={busy} onClick={onInstall}>
              <Download className="h-4 w-4" /> {r.update ? t('Update ({from} → {to})', { from: r.installed, to: r.version }) : t('Install')}
            </Button>
          )}
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-slate-400 hover:text-accent" title={t('Resource page')}>
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Installed extensions (plugins)

interface ExtensionsData {
  items: InstalledExtension[];
  allowUnverified: boolean;
  version: string;
}

function UnverifiedOption({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Card className="mt-6">
      <Toggle
        checked={value}
        onChange={onChange}
        label={t('Allow unverified extensions')}
        description={t('Lets you install and turn on .zip files that do not come from the market. A plugin has access to the whole CMS: only turn this on for trusted sources (or to build your own extensions).')}
      />
    </Card>
  );
}

export function PluginsPage() {
  const { data, error, reload, setData } = useLoad<ExtensionsData>('features/extensions');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;
  const plugins = data.items.filter((e) => e.type === 'plugin');

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'success', text: t(done) });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const setAllow = async (v: boolean) => {
    try {
      await api.put('features/extensions/options', { allowUnverified: v });
      setData({ ...data, allowUnverified: v });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <>
      <PageHeader
        title="Plugins"
        description={t('Plugins add pages, blocks and features to the site. Reload the page after turning one on to see its pages.')}
        actions={
          <>
            <Link to="/admin/market">
              <Button variant="secondary">
                <Puzzle className="h-4 w-4" /> Market
              </Button>
            </Link>
            <UploadButton
              onDone={(ext) => {
                setMsg({ kind: 'success', text: t('{name} {version} is installed.', { name: ext.name, version: ext.version }) });
                reload();
              }}
              onError={(text) => setMsg({ kind: 'error', text })}
            />
          </>
        }
      />
      {msg && (
        <Alert kind={msg.kind} className="mb-4">
          {msg.text}
        </Alert>
      )}
      {plugins.length === 0 ? (
        <Empty>
          {t('No plugin installed. Browse the')}{' '}
          <Link to="/admin/market" className="text-accent">
            market
          </Link>{' '}
          {t('or install a .zip file.')}
        </Empty>
      ) : (
        <div className="space-y-3">
          {plugins.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start gap-4">
                <ExtIcon src={p.iconUrl} type="plugin" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {p.name} <span className="text-sm font-normal text-slate-500">v{p.version}</span>
                    <VerifiedBadge verified={p.verified} />
                    {p.enabled ? <Badge tone="green">{t('On')}</Badge> : <Badge>{t('Off')}</Badge>}
                    {!p.compatible && <Badge tone="red">{t('Needs PalCMS {version}', { version: p.palcms })}</Badge>}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{p.description || t('No description.')}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {p.author && `${t('by {name}', { name: p.author })} · `}
                    {p.source === 'market' ? t('from the market') : p.source === 'upload' ? t('from a file') : t('local folder')}
                    {p.homepage && (
                      <>
                        {' · '}
                        <a href={p.homepage} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                          {t('plugin website')}
                        </a>
                      </>
                    )}
                  </p>
                  {p.error && (
                    <Alert kind="error" className="mt-3">
                      {t('Loading error: {error}', { error: p.error })}
                    </Alert>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.settings.length > 0 && (
                    <Button variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)} title={t('Settings')}>
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant={p.enabled ? 'secondary' : 'primary'}
                    loading={busy === p.id}
                    disabled={!p.compatible && !p.enabled}
                    onClick={() =>
                      void act(p.id, () => api.put(`features/extensions/${p.id}`, { enabled: !p.enabled }), p.enabled ? t('{name} is off.', { name: p.name }) : t('{name} is on.', { name: p.name }))
                    }
                  >
                    <Power className="h-4 w-4" /> {p.enabled ? t('Turn off') : t('Turn on')}
                  </Button>
                  <Button
                    variant="ghost"
                    title={t('Delete')}
                    onClick={() => {
                      if (confirm(t('Delete {name}? Its files are erased; its data in the database is kept.', { name: p.name }))) {
                        void act(p.id, () => api.del(`features/extensions/${p.id}`), t('{name} is deleted.', { name: p.name }));
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
              {editing === p.id && <ExtensionSettingsForm ext={p} onSaved={() => setMsg({ kind: 'success', text: t('Settings saved.') })} />}
            </Card>
          ))}
        </div>
      )}
      <UnverifiedOption value={data.allowUnverified} onChange={(v) => void setAllow(v)} />
    </>
  );
}

// Settings of an extension

export function ExtensionSettingsForm({ ext, onSaved, reloadOnSave }: { ext: InstalledExtension; onSaved?: () => void; reloadOnSave?: boolean }) {
  const { data, error } = useLoad<{ settings: ExtensionSettingDef[]; values: ExtensionSettingValues }>(`features/extensions/${ext.id}/settings`);
  const [values, setValues] = useState<ExtensionSettingValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const v = values ?? data?.values ?? null;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data || !v) return <Spinner />;

  const set = (key: string, value: string | number | boolean) => setValues({ ...v, [key]: value });
  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await api.put(`features/extensions/${ext.id}/settings`, v);
      onSaved?.();
      if (reloadOnSave) location.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
      {err && <Alert kind="error">{err}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {data.settings.map((d) => (
          <SettingField key={d.key} def={d} value={v[d.key]} onChange={(x) => set(d.key, x)} />
        ))}
      </div>
      <Button loading={saving} onClick={() => void save()}>
        {t('Save the settings')}
      </Button>
    </div>
  );
}

function SettingField({ def, value, onChange }: { def: ExtensionSettingDef; value: string | number | boolean | undefined; onChange: (v: string | number | boolean) => void }) {
  if (def.type === 'toggle') {
    return <Toggle checked={value === true} onChange={onChange} label={def.label} description={def.description} />;
  }
  const str = value === undefined ? '' : String(value);
  return (
    <Field label={def.label} help={def.description} className={def.type === 'textarea' ? 'md:col-span-2' : undefined}>
      {(id) =>
        def.type === 'color' ? (
          <div className="flex items-center gap-2">
            <input id={id} type="color" value={str || '#000000'} onChange={(e) => onChange(e.target.value)} className="h-9 w-14 cursor-pointer rounded" />
            <Input value={str} onChange={(e) => onChange(e.target.value)} className="font-mono" />
          </div>
        ) : def.type === 'textarea' ? (
          <Textarea id={id} value={str} onChange={(e) => onChange(e.target.value)} rows={4} />
        ) : def.type === 'select' ? (
          <Select id={id} value={str} onChange={(e) => onChange(e.target.value)}>
            {(def.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : def.type === 'image' ? (
          <ImageField value={str} onChange={onChange} previewClass="h-16 w-28" />
        ) : def.type === 'number' ? (
          <Input id={id} type="number" value={str} onChange={(e) => onChange(Number(e.target.value))} />
        ) : (
          <Input id={id} value={str} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

// Installed themes (top of the Themes page)

export function InstalledThemes() {
  const { boot } = useApp();
  const canInstall = boot.user?.permissions.includes('admin.extensions') ?? false;
  const { data, error, reload } = useLoad<{ items: InstalledExtension[]; active: string | null }>('features/extensions/themes');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  if (isDemo && error) return null;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;

  const activate = async (id: string | null) => {
    setBusy(id ?? 'default');
    setMsg(null);
    try {
      await api.put('features/extensions/themes/active', { id });
      // A theme changes the site layout: reload to apply it everywhere.
      location.reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
      setBusy(null);
    }
  };
  const remove = async (theme: InstalledExtension) => {
    if (!confirm(t('Delete the theme {name}?', { name: theme.name }))) return;
    try {
      await api.del(`features/extensions/${theme.id}`);
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  const editedTheme = data.items.find((x) => x.id === editing) ?? null;
  const cards = [
    {
      id: null as string | null,
      name: t('PalCMS (default)'),
      description: t('The original theme, adjustable with Appearance and the advanced settings below.'),
      theme: null as InstalledExtension | null,
    },
  ].concat(data.items.map((x) => ({ id: x.id as string | null, name: x.name, description: x.description, theme: x as InstalledExtension | null })));

  return (
    <Card
      title={t('Installed themes')}
      className="mb-6"
      actions={
        canInstall && (
          <div className="flex gap-2">
            <Link to="/admin/market">
              <Button variant="secondary">
                <Download className="h-4 w-4" /> Market
              </Button>
            </Link>
            <UploadButton
              onDone={(ext) => {
                setMsg({ kind: 'success', text: t('{name} {version} is installed.', { name: ext.name, version: ext.version }) });
                reload();
              }}
              onError={(text) => setMsg({ kind: 'error', text })}
            />
          </div>
        )
      }
    >
      {msg && (
        <Alert kind={msg.kind} className="mb-4">
          {msg.text}
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => {
          const active = data.active === c.id;
          return (
            <div
              key={c.id ?? 'default'}
              className={cx('rounded-xl border p-4', active ? 'border-accent ring-2 ring-accent/30' : 'border-slate-200 dark:border-slate-800')}
            >
              <div className="flex items-start gap-3">
                <ExtIcon src={c.theme?.iconUrl} type="theme" className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  {c.theme && (
                    <p className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                      v{c.theme.version}
                      {c.theme.author && ` · ${c.theme.author}`} <VerifiedBadge verified={c.theme.verified} />
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{c.description}</p>
              {c.theme && !c.theme.compatible && <Badge tone="red">{t('Needs PalCMS {version}', { version: c.theme.palcms })}</Badge>}
              <div className="mt-3 flex flex-wrap gap-2">
                {active ? (
                  <Badge tone="green">{t('Active theme')}</Badge>
                ) : (
                  <Button loading={busy === (c.id ?? 'default')} disabled={!!c.theme && !c.theme.compatible} onClick={() => void activate(c.id)}>
                    {t('Turn on')}
                  </Button>
                )}
                {c.theme && c.theme.settings.length > 0 && (
                  <Button variant="secondary" onClick={() => setEditing(editing === c.id ? null : c.id)}>
                    <Settings2 className="h-4 w-4" /> {t('Customize')}
                  </Button>
                )}
                {c.theme && canInstall && !active && (
                  <Button variant="ghost" title={t('Delete')} onClick={() => void remove(c.theme!)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editedTheme && (
        <div>
          <p className="mt-6 font-semibold">{t('Customize {name}', { name: editedTheme.name })}</p>
          <ExtensionSettingsForm
            key={editedTheme.id}
            ext={editedTheme}
            reloadOnSave={data.active === editedTheme.id}
            onSaved={() => setMsg({ kind: 'success', text: t('Theme settings saved.') })}
          />
        </div>
      )}
    </Card>
  );
}

// Admin pages added by plugins

export function PluginAdminPage({ page }: { page: ExtAdminPage }) {
  const { boot } = useApp();
  if (page.permission && !boot.user?.permissions.includes(page.permission)) {
    return <Alert kind="error">{t('Not enough permissions.')}</Alert>;
  }
  const C = page.component;
  return (
    <ExtensionBoundary ext={page.ext}>
      <C />
    </ExtensionBoundary>
  );
}
