import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import type { NewsItem, PageItem } from '@palcms/shared';
import { api, ApiError, errorText, url } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { RichEditor } from '../components/RichEditor';
import { ImageField } from '../components/ImageField';
import { Alert, Badge, Button, Card, Empty, Field, Input, PageHeader, Spinner, Textarea, Toggle } from '../components/ui';
import { useLoad } from './AdminLayout';

const toSlug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [saved, setSaved] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  const field = (n: string) => (error instanceof ApiError ? error.field(n) : undefined);
  return { busy, error, saved, run, field };
}

// Pages

export function PagesList() {
  const { data, error, reload } = useLoad<PageItem[]>('admin/site/pages');
  const remove = async (p: PageItem) => {
    if (!window.confirm(`Supprimer la page « ${p.title} » ?`)) return;
    await api.del(`admin/site/pages/${p.id}`);
    reload();
  };
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Pages"
        description="Pages libres du site, accessibles à l'adresse /p/nom-de-la-page."
        actions={
          <Link to="/admin/site/pages/nouvelle" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
            <Plus className="h-4 w-4" /> Nouvelle page
          </Link>
        }
      />
      <Card>
        {data.length === 0 ? (
          <Empty>Aucune page.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.title}</p>
                  <p className="font-mono text-xs text-slate-500">/p/{p.slug}</p>
                </div>
                {!p.published && <Badge tone="amber">Brouillon</Badge>}
                <span className="text-xs text-slate-500">Modifiée le {formatDateTime(p.updatedAt)}</span>
                <a href={url(`p/${p.slug}`)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Voir">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <Link to={`/admin/site/pages/${p.id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Modifier">
                  <Pencil className="h-4 w-4" />
                </Link>
                <button onClick={() => void remove(p)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Astuce : les pages « regles » et « rejoindre » sont liées au menu et au bouton « Rejoindre » de l'accueil.
        </p>
      </Card>
    </>
  );
}

export function PageEditor() {
  const { id } = useParams();
  const isNew = id === 'nouvelle';
  const navigate = useNavigate();
  const [form, setForm] = useState({ slug: '', title: '', contentHtml: '', published: true });
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [loaded, setLoaded] = useState(isNew);
  const s = useSave();

  useEffect(() => {
    if (isNew) return;
    api.get<PageItem>(`admin/site/pages/${id}`).then((p) => {
      setForm({ slug: p.slug, title: p.title, contentHtml: p.contentHtml, published: p.published });
      setLoaded(true);
    });
  }, [id, isNew]);

  const save = () =>
    void s.run(async () => {
      if (isNew) {
        const p = await api.post<PageItem>('admin/site/pages', form);
        navigate(`/admin/site/pages/${p.id}`, { replace: true });
      } else {
        await api.put(`admin/site/pages/${id}`, form);
      }
    });

  if (!loaded) return <Spinner />;
  return (
    <>
      <Link to="/admin/site/pages" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent">
        <ArrowLeft className="h-4 w-4" /> Pages
      </Link>
      <PageHeader
        title={isNew ? 'Nouvelle page' : form.title || 'Page'}
        actions={
          <Button onClick={save} loading={s.busy}>
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        }
      />
      {s.saved && <Alert kind="success" className="mb-4">Page enregistrée.</Alert>}
      {s.error && <Alert kind="error" className="mb-4">{s.error.message}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Field label="Titre" error={s.field('title')}>
            {(fid) => (
              <Input
                id={fid}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value, slug: slugTouched ? form.slug : toSlug(e.target.value) })}
              />
            )}
          </Field>
          <RichEditor value={form.contentHtml} onChange={(html) => setForm((f) => ({ ...f, contentHtml: html }))} />
        </div>
        <Card className="h-fit space-y-4">
          <Field label="Adresse" help={`/p/${form.slug || '…'}`} error={s.field('slug')}>
            {(fid) => (
              <Input
                id={fid}
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm({ ...form, slug: e.target.value });
                }}
                className="font-mono"
              />
            )}
          </Field>
          <Toggle checked={form.published} onChange={(v) => setForm({ ...form, published: v })} label="Publiée" description="Visible sur le site" />
        </Card>
      </div>
    </>
  );
}

// Actualités

export function NewsAdminList() {
  const { data, error, reload } = useLoad<NewsItem[]>('admin/site/news');
  const remove = async (n: NewsItem) => {
    if (!window.confirm(`Supprimer l'article « ${n.title} » ?`)) return;
    await api.del(`admin/site/news/${n.id}`);
    reload();
  };
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Actualités"
        actions={
          <Link to="/admin/site/actualites/nouvelle" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
            <Plus className="h-4 w-4" /> Nouvel article
          </Link>
        }
      />
      <Card>
        {data.length === 0 ? (
          <Empty>Aucun article.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 py-3">
                {n.coverUrl && <img src={n.coverUrl} alt="" className="h-10 w-16 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-slate-500">
                    {n.published ? `Publié le ${formatDate(n.publishedAt)}` : 'Brouillon'}
                    {n.author && ` · ${n.author}`}
                  </p>
                </div>
                {n.published ? <Badge tone="green">Publié</Badge> : <Badge tone="amber">Brouillon</Badge>}
                <Link to={`/admin/site/actualites/${n.id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Modifier">
                  <Pencil className="h-4 w-4" />
                </Link>
                <button onClick={() => void remove(n)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Supprimer">
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

export function NewsEditor() {
  const { id } = useParams();
  const isNew = id === 'nouvelle';
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', slug: '', excerpt: '', contentHtml: '', coverUrl: '', published: false });
  const [loaded, setLoaded] = useState(isNew);
  const s = useSave();

  useEffect(() => {
    if (isNew) return;
    api
      .get<NewsItem>(`admin/site/news/${id}`)
      .then((n) => {
        setForm({ title: n.title, slug: n.slug, excerpt: n.excerpt, contentHtml: n.contentHtml, coverUrl: n.coverUrl ?? '', published: n.published });
        setLoaded(true);
      })
      .catch((e) => s.run(() => Promise.reject(new Error(errorText(e)))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  const save = () =>
    void s.run(async () => {
      const body = { ...form, slug: form.slug || undefined };
      if (isNew) {
        const n = await api.post<NewsItem>('admin/site/news', body);
        navigate(`/admin/site/actualites/${n.id}`, { replace: true });
      } else {
        const n = await api.put<NewsItem>(`admin/site/news/${id}`, body);
        setForm((f) => ({ ...f, slug: n.slug }));
      }
    });

  if (!loaded) return <Spinner />;
  return (
    <>
      <Link to="/admin/site/actualites" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent">
        <ArrowLeft className="h-4 w-4" /> Actualités
      </Link>
      <PageHeader
        title={isNew ? 'Nouvel article' : form.title || 'Article'}
        actions={
          <Button onClick={save} loading={s.busy}>
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        }
      />
      {s.saved && <Alert kind="success" className="mb-4">Article enregistré.</Alert>}
      {s.error && <Alert kind="error" className="mb-4">{s.error.message}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Field label="Titre" error={s.field('title')}>
            {(fid) => <Input id={fid} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <Field label="Résumé" help="Affiché dans la liste des actualités et sur l'accueil" error={s.field('excerpt')}>
            {(fid) => <Textarea id={fid} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} />}
          </Field>
          <RichEditor value={form.contentHtml} onChange={(html) => setForm((f) => ({ ...f, contentHtml: html }))} />
        </div>
        <Card className="h-fit space-y-4">
          <Toggle checked={form.published} onChange={(v) => setForm({ ...form, published: v })} label="Publié" description="Visible sur le site" />
          <Field label="Image de couverture">{() => <ImageField value={form.coverUrl} onChange={(v) => setForm({ ...form, coverUrl: v })} previewClass="h-24" />}</Field>
          <Field label="Adresse (facultatif)" help="Générée depuis le titre si vide" error={s.field('slug')}>
            {(fid) => <Input id={fid} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="font-mono" />}
          </Field>
        </Card>
      </div>
    </>
  );
}
