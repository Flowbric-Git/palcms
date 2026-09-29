import { Navigate, Route, Routes } from 'react-router-dom';
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

/** Panel admin, chargé à la demande : le site public ne télécharge jamais l'éditeur ni les écrans admin. */
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="serveur" replace />} />
        <Route path="serveur" element={<DashboardPage />} />
        <Route path="serveur/connexion" element={<ConnectionPage />} />
        <Route path="serveur/configuration" element={<ConfigPage />} />
        <Route path="serveur/joueurs" element={<PlayersPage />} />
        <Route path="serveur/logs" element={<LogsPage />} />
        <Route path="serveur/sauvegardes" element={<BackupsPage />} />
        <Route path="serveur/programmation" element={<SchedulesPage />} />
        <Route path="serveur/annonces" element={<AnnouncementsPage />} />
        <Route path="serveur/moderation" element={<ModerationPage />} />
        <Route path="serveur/rcon" element={<RconPage />} />
        <Route path="serveur/surveillance" element={<MonitoringPage />} />
        <Route path="serveur/statistiques" element={<StatsPage />} />
        <Route path="serveur/monde" element={<WorldPage />} />
        <Route path="serveur/monde/:id" element={<WorldPlayerPage />} />
        <Route path="serveur/evenements" element={<EventsPage />} />
        <Route path="serveur/anti-triche" element={<AntiCheatPage />} />
        <Route path="serveur/sanctions" element={<SanctionsPage />} />
        <Route path="site/signalements" element={<TicketsAdminPage />} />
        <Route path="mises-a-jour" element={<UpdatesPage />} />
        <Route path="site/pages" element={<PagesList />} />
        <Route path="site/pages/:id" element={<PageEditor />} />
        <Route path="site/actualites" element={<NewsAdminList />} />
        <Route path="site/actualites/:id" element={<NewsEditor />} />
        <Route path="site/menu" element={<MenuPage />} />
        <Route path="site/apparence" element={<AppearancePage />} />
        <Route path="site/themes" element={<ThemesPage />} />
        <Route path="site/carte" element={<MapAdminPage />} />
        <Route path="site/discord" element={<DiscordPage />} />
        <Route path="site/modules" element={<ModulesPage />} />
        <Route path="site/membres" element={<MembersPage />} />
        <Route path="equipe" element={<TeamPage />} />
        <Route path="journal" element={<AuditPage />} />
        <Route path="market" element={<MarketPage />} />
        <Route path="plugins" element={<PluginsPage />} />
        {registry.adminPages.map((p) => (
          <Route key={`${p.ext}:${p.path}`} path={`plugins/${p.ext}/${p.path}`} element={<PluginAdminPage page={p} />} />
        ))}
        <Route path="compte" element={<AccountPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
