import { StrictMode, Suspense, lazy, useEffect, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { api, basePath, isDemo } from './lib/api';
import { AppProvider, useApp } from './lib/app';
import { Spinner } from './components/ui';
import { PublicLayout } from './public/PublicLayout';
import { Home } from './public/Home';
import { CmsPage, NewsDetail, NewsList, NotFound } from './public/pages';
import { LoginPage, ProfilePage, RegisterPage } from './public/account';
import { LeaderboardPage, PlayerPage } from './features/public';
import { applyTheme, type ThemeSettings } from './features/theme';
import { ExtensionBoundary, registry } from './lib/extensions';

// Loaded on demand: the wizard is used once, the admin panel only by the team,
// and the map (Leaflet) only when it is opened.
const SetupWizard = lazy(() => import('./setup/SetupWizard').then((m) => ({ default: m.SetupWizard })));
const AdminApp = lazy(() => import('./admin/AdminApp'));
const MapPage = lazy(() => import('./features/mapPages').then((m) => ({ default: m.MapPage })));
const DemoBar = isDemo ? lazy(() => import('./demo/DemoBar')) : null;
const world = () => import('./features/world-public');
const GuildsPage = lazy(() => world().then((m) => ({ default: m.GuildsPage })));
const GuildPage = lazy(() => world().then((m) => ({ default: m.GuildPage })));
const PaldexPage = lazy(() => world().then((m) => ({ default: m.PaldexPage })));
const CalendarPage = lazy(() => world().then((m) => ({ default: m.CalendarPage })));
const UptimePage = lazy(() => world().then((m) => ({ default: m.UptimePage })));
const TicketsPage = lazy(() => world().then((m) => ({ default: m.TicketsPage })));

const lazyPage = (el: ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

// Public URLs used before 1.1.0 (French): old links and bookmarks keep working.
const LEGACY_PUBLIC: [string, string][] = [
  ['actualites', 'news'],
  ['classement', 'leaderboard'],
  ['carte', 'map'],
  ['joueurs', 'players'],
  ['guildes', 'guilds'],
  ['evenements', 'events'],
  ['disponibilite', 'uptime'],
  ['signaler', 'report'],
  ['connexion', 'login'],
  ['inscription', 'register'],
  ['profil', 'profile'],
];

function LegacyRedirect({ from, to }: { from: string; to: string }) {
  const { pathname, search } = useLocation();
  const rest = pathname.slice(pathname.indexOf(`/${from}`) + from.length + 1);
  return <Navigate to={`/${to}${rest}${search}`} replace />;
}

const extensionPage = (ext: string, Page: ComponentType) => (
  <ExtensionBoundary ext={ext}>
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  </ExtensionBoundary>
);

/** Applies the advanced theme (font, background, custom CSS) chosen in the panel. */
function ThemeLoader() {
  const { boot } = useApp();
  useEffect(() => {
    if (!boot.setupDone) return;
    api
      .get<ThemeSettings>('features/theme')
      .then(applyTheme)
      .catch(() => {});
  }, [boot.setupDone]);
  return null;
}

function AppRoutes() {
  const { boot } = useApp();
  // Until setup is finished, the whole site shows the wizard.
  if (!boot.setupDone) {
    return (
      <Suspense fallback={<Spinner />}>
        <SetupWizard />
      </Suspense>
    );
  }
  const m = boot.modules;
  return (
    <>
      <ThemeLoader />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          {m.news && <Route path="news" element={<NewsList />} />}
          {m.news && <Route path="news/:slug" element={<NewsDetail />} />}
          {m.leaderboard && <Route path="leaderboard" element={<LeaderboardPage />} />}
          <Route
            path="map"
            element={
              <Suspense fallback={<Spinner />}>
                <MapPage />
              </Suspense>
            }
          />
          <Route path="players/:id" element={<PlayerPage />} />
          {m.guilds && <Route path="guilds" element={lazyPage(<GuildsPage />)} />}
          {m.guilds && <Route path="guilds/:id" element={lazyPage(<GuildPage />)} />}
          {m.paldex && <Route path="paldex" element={lazyPage(<PaldexPage />)} />}
          {m.calendar && <Route path="events" element={lazyPage(<CalendarPage />)} />}
          {m.uptime && <Route path="uptime" element={lazyPage(<UptimePage />)} />}
          {m.tickets && <Route path="report" element={lazyPage(<TicketsPage />)} />}
          <Route path="p/:slug" element={<CmsPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="profile" element={<ProfilePage />} />
          {LEGACY_PUBLIC.map(([from, to]) => (
            <Route key={from} path={`${from}/*`} element={<LegacyRedirect from={from} to={to} />} />
          ))}
          <Route path="setup" element={<Navigate to="/" replace />} />
          {registry.pages
            .filter((p) => p.layout)
            .map((p) => (
              <Route key={`${p.ext}:${p.path}`} path={p.path} element={extensionPage(p.ext, p.component)} />
            ))}
          <Route path="*" element={<NotFound />} />
        </Route>
        {registry.pages
          .filter((p) => !p.layout)
          .map((p) => (
            <Route key={`${p.ext}:${p.path}`} path={p.path} element={extensionPage(p.ext, p.component)} />
          ))}
        <Route
          path="admin/*"
          element={
            <Suspense fallback={<Spinner />}>
              <AdminApp />
            </Suspense>
          }
        />
      </Routes>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basePath.replace(/\/$/, '') || '/'}>
      <AppProvider fallback={<Spinner />}>
        {DemoBar && (
          <Suspense fallback={null}>
            <DemoBar />
          </Suspense>
        )}
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
