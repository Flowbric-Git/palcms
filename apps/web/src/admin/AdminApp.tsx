import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NotFound } from '../public/pages';
import { AdminLayout } from './AdminLayout';
import { ConfigPage, ConnectionPage, DashboardPage, LogsPage, PlayersPage } from './server';
import { NewsAdminList, NewsEditor, PageEditor, PagesList } from './content';
import { AppearancePage, MembersPage, MenuPage, ModulesPage } from './site';
import { AccountPage } from './misc';
import { AnnouncementsPage, BackupsPage, ModerationPage, RconPage, SchedulesPage } from '../features/admin-server';
import { AuditPage, DiscordPage, MapAdminPage, TeamPage, ThemesPage } from '../features/admin-site';
import {
  AntiCheatPage,
  EventsPage,
  MonitoringPage,
  SanctionsPage,
  StatsPage,
  TicketsAdminPage,
  UpdatesPage,
  WorldPage,
  WorldPlayerPage,
} from '../features/admin-ops';
import { MarketPage, PluginAdminPage, PluginsPage } from '../features/admin-extensions';
import { registry } from '../lib/extensions';

// Panel URLs used before 1.1.0 (French), redirected to the English ones.
const LEGACY: [RegExp, string][] = [
  [/^serveur\/connexion/, 'server/connection'],
  [/^serveur\/configuration/, 'server/config'],
  [/^serveur\/joueurs/, 'server/players'],
  [/^serveur\/sauvegardes/, 'server/backups'],
  [/^serveur\/programmation/, 'server/schedules'],
  [/^serveur\/annonces/, 'server/announcements'],
  [/^serveur\/surveillance/, 'server/monitoring'],
  [/^serveur\/statistiques/, 'server/stats'],
  [/^serveur\/monde/, 'server/world'],
  [/^serveur\/evenements/, 'server/events'],
  [/^serveur\/anti-triche/, 'server/anti-cheat'],
  [/^serveur/, 'server'],
  [/^site\/signalements/, 'site/reports'],
  [/^site\/actualites/, 'site/news'],
  [/^site\/apparence/, 'site/appearance'],
  [/^site\/carte/, 'site/map'],
  [/^site\/membres/, 'site/members'],
  [/^mises-a-jour/, 'updates'],
  [/^equipe/, 'team'],
  [/^journal/, 'audit'],
  [/^compte/, 'account'],
];

function LegacyRedirect() {
  const { pathname, search } = useLocation();
  const rest = pathname.replace(/^.*?\/admin\/?/, '');
  const hit = LEGACY.find(([re]) => re.test(rest));
  if (!hit) return <NotFound />;
  return <Navigate to={`/admin/${rest.replace(hit[0], hit[1])}${search}`} replace />;
}

/** Admin panel, loaded on demand: the public site never downloads the editor or the admin screens. */
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="server" replace />} />
        <Route path="server" element={<DashboardPage />} />
        <Route path="server/connection" element={<ConnectionPage />} />
        <Route path="server/config" element={<ConfigPage />} />
        <Route path="server/players" element={<PlayersPage />} />
        <Route path="server/logs" element={<LogsPage />} />
        <Route path="server/backups" element={<BackupsPage />} />
        <Route path="server/schedules" element={<SchedulesPage />} />
        <Route path="server/announcements" element={<AnnouncementsPage />} />
        <Route path="server/moderation" element={<ModerationPage />} />
        <Route path="server/rcon" element={<RconPage />} />
        <Route path="server/monitoring" element={<MonitoringPage />} />
        <Route path="server/stats" element={<StatsPage />} />
        <Route path="server/world" element={<WorldPage />} />
        <Route path="server/world/:id" element={<WorldPlayerPage />} />
        <Route path="server/events" element={<EventsPage />} />
        <Route path="server/anti-cheat" element={<AntiCheatPage />} />
        <Route path="server/sanctions" element={<SanctionsPage />} />
        <Route path="site/reports" element={<TicketsAdminPage />} />
        <Route path="updates" element={<UpdatesPage />} />
        <Route path="site/pages" element={<PagesList />} />
        <Route path="site/pages/:id" element={<PageEditor />} />
        <Route path="site/news" element={<NewsAdminList />} />
        <Route path="site/news/:id" element={<NewsEditor />} />
        <Route path="site/menu" element={<MenuPage />} />
        <Route path="site/appearance" element={<AppearancePage />} />
        <Route path="site/themes" element={<ThemesPage />} />
        <Route path="site/map" element={<MapAdminPage />} />
        <Route path="site/discord" element={<DiscordPage />} />
        <Route path="site/modules" element={<ModulesPage />} />
        <Route path="site/members" element={<MembersPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="market" element={<MarketPage />} />
        <Route path="plugins" element={<PluginsPage />} />
        {registry.adminPages.map((p) => (
          <Route key={`${p.ext}:${p.path}`} path={`plugins/${p.ext}/${p.path}`} element={<PluginAdminPage page={p} />} />
        ))}
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<LegacyRedirect />} />
      </Route>
    </Routes>
  );
}
