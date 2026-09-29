import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Trophy } from 'lucide-react';
import type { NewsSummary, SiteSettings } from '@palcms/shared';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useLiveServer } from '../lib/live';
import { formatDate } from '../lib/format';
import { LeaderboardTable, OnlinePlayers, ServerStatusCard } from '../components/live';
import { Card } from '../components/ui';
import { Overridable, Slot } from '../lib/extensions';

const MapWidget = lazy(() => import('../features/mapPages').then((m) => ({ default: m.MapWidget })));
const EventBanner = lazy(() => import('../features/world-public').then((m) => ({ default: m.EventBanner })));

/** Ce que reçoivent l'accueil et son bandeau, y compris ceux d'un thème. */
export interface HomeProps {
  site: SiteSettings;
  modules: Record<string, boolean>;
  live: ReturnType<typeof useLiveServer>;
  news: NewsSummary[];
}

export function Home() {
  const { boot } = useApp();
  const { site, modules } = boot;
  const live = useLiveServer();
  const [news, setNews] = useState<NewsSummary[]>([]);

  useEffect(() => {
    if (modules.news) api.get<{ items: NewsSummary[] }>('public/news').then((r) => setNews(r.items.slice(0, 3))).catch(() => {});
  }, [modules.news]);

  return <Overridable slot="home" fallback={DefaultHome} props={{ site, modules, live, news }} />;
}

export function DefaultHome(props: HomeProps) {
  const { modules, live, news } = props;
  return (
    <>
      <Overridable slot="home.hero" fallback={DefaultHomeHero} props={props} />

      <div className="mx-auto max-w-6xl space-y-8 px-4 pb-16">
        <Slot name="home.top" {...props} />
        {modules.calendar && (
          <Suspense fallback={null}>
            <EventBanner />
          </Suspense>
        )}
        {modules.status && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <ServerStatusCard status={live.status} />
            <OnlinePlayers players={live.players} />
          </div>
        )}

        {modules.map && (
          <Suspense fallback={null}>
            <MapWidget />
          </Suspense>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {modules.news && (
            <Card
              title="Dernières actualités"
              actions={
                <Link to="/actualites" className="text-sm font-medium text-accent">
                  Tout voir
                </Link>
              }
            >
              {news.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune actualité pour le moment.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {news.map((n) => (
                    <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                      <Link to={`/actualites/${n.slug}`} className="group flex gap-4">
                        {n.coverUrl && <img src={n.coverUrl} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />}
                        <div className="min-w-0">
                          <p className="font-semibold group-hover:text-accent">{n.title}</p>
                          <p className="line-clamp-2 text-sm text-slate-500">{n.excerpt}</p>
                          <p className="mt-1 text-xs text-slate-400">{formatDate(n.publishedAt)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {modules.leaderboard && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" /> Top joueurs
                </span>
              }
              actions={
                <Link to="/classement" className="text-sm font-medium text-accent">
                  Classement complet
                </Link>
              }
            >
              <LeaderboardTable entries={live.leaderboard?.slice(0, 10) ?? null} compact />
            </Card>
          )}
        </div>
        <Slot name="home.bottom" {...props} />
      </div>
    </>
  );
}

export function DefaultHomeHero({ site }: HomeProps) {
  return (
    <section className="relative overflow-hidden">
      {site.bannerUrl ? (
        <img src={site.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 dark:opacity-30" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent)_0%,transparent_60%)] opacity-25" />
      )}
      <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{site.heroTitle || site.name}</h1>
        {(site.heroText || site.tagline) && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-300">{site.heroText || site.tagline}</p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/p/rejoindre" className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg shadow-lg hover:brightness-110">
            Rejoindre le serveur <ArrowRight className="h-4 w-4" />
          </Link>
          {site.discordUrl && (
            <a
              href={site.discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 font-semibold text-white shadow-lg hover:brightness-110"
            >
              <MessageCircle className="h-4 w-4" /> Discord
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
