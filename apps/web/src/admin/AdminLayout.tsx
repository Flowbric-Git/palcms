import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Archive,
  BarChart3,
  Blocks,
  CalendarClock,
  Download,
  ExternalLink,
  Flag,
  Gavel,
  Globe,
  PartyPopper,
  Radar,
  FileText,
  Gauge,
  LayoutList,
  Map as MapIcon,
  Megaphone,
  Menu as MenuIcon,
  MessageSquare,
  Newspaper,
  Palette,
  PlugZap,
  Puzzle,
  Store,
  ScrollText,
  Settings2,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  UserCircle,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import type { Permission } from '@palcms/shared';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { ThemeToggle } from '../components/ThemeToggle';
import { Badge, cx } from '../components/ui';
import { registry } from '../lib/extensions';

export { useLoad } from '../lib/useLoad';

interface NavEntry {
  to: string;
  label: string;
  icon: typeof Gauge;
  /** Sans permission : visible par toute l'équipe. */
  permission?: Permission;
  /** Uniquement pour un serveur installé et géré par PalCMS (masqué pour un serveur externe). */
  managedOnly?: boolean;
  badge?: ReactNode;
}

function Item({ to, icon: Icon, children, badge }: { to: string; icon: typeof Gauge; children: ReactNode; badge?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/admin/serveur'}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
          isActive ? 'bg-accent/10 text-accent' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{children}</span>
      {badge}
    </NavLink>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function AdminLayout() {
  const { boot, isAdmin } = useApp();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  // Les thèmes du site public (fond, CSS perso) ne s'appliquent pas au panel.
  useEffect(() => {
    document.body.classList.add('palcms-admin');
    // Le CSS du thème installé ne s'applique pas non plus au panel.
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[data-palcms-theme]')];
    links.forEach((link) => (link.disabled = true));
    return () => {
      document.body.classList.remove('palcms-admin');
      links.forEach((link) => (link.disabled = false));
    };
  }, []);
  useEffect(() => {
    if (!isAdmin || !boot.user?.permissions.includes('site.members')) return;
    api
      .get<unknown[]>('admin/members?status=pending')
      .then((r) => setPending(r.length))
      .catch(() => {});
  }, [isAdmin, boot.user, location.pathname]);
  useEffect(() => {
    if (!isAdmin || !boot.user?.permissions.includes('site.tickets')) return;
    api
      .get<{ open: number }>('features/tickets?status=open')
      .then((r) => setOpenTickets(r.open))
      .catch(() => {});
  }, [isAdmin, boot.user, location.pathname]);

  if (!boot.user) return <Navigate to="/connexion" replace />;
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">Accès réservé aux administrateurs.</p>
        <Link to="/" className="text-accent">
          Retour au site
        </Link>
      </div>
    );
  }

  // Chaque membre de l'équipe ne voit que les rubriques autorisées par son rôle.
  const perms = new Set(boot.user.permissions);
  const managed = boot.serverMode === 'managed';
  const visible = (list: NavEntry[]) => list.filter((e) => (!e.permission || perms.has(e.permission)) && (managed || !e.managedOnly));
  const render = (e: NavEntry) => (
    <Item key={e.to} to={e.to} icon={e.icon} badge={e.badge}>
      {e.label}
    </Item>
  );

  const server = visible([
    { to: '/admin/serveur', label: 'Tableau de bord', icon: Gauge },
    { to: '/admin/serveur/surveillance', label: 'Surveillance', icon: Activity, permission: 'server.players' },
    { to: '/admin/serveur/statistiques', label: 'Statistiques', icon: BarChart3, permission: 'server.players' },
    { to: '/admin/serveur/connexion', label: 'Connexion au serveur', icon: PlugZap, permission: 'server.config' },
    { to: '/admin/serveur/configuration', label: 'Configuration', icon: Settings2, permission: 'server.config', managedOnly: true },
    { to: '/admin/serveur/evenements', label: 'Événements', icon: PartyPopper, permission: 'server.events', managedOnly: true },
    { to: '/admin/serveur/joueurs', label: 'Joueurs', icon: Users, permission: 'server.players' },
    { to: '/admin/serveur/monde', label: 'Données du monde', icon: Globe, permission: 'server.world', managedOnly: true },
    { to: '/admin/serveur/logs', label: 'Logs', icon: ScrollText, permission: 'server.logs', managedOnly: true },
    { to: '/admin/serveur/sauvegardes', label: 'Sauvegardes', icon: Archive, permission: 'server.backups', managedOnly: true },
    { to: '/admin/serveur/programmation', label: 'Programmation', icon: CalendarClock, permission: 'server.schedules', managedOnly: true },
    { to: '/admin/serveur/annonces', label: 'Annonces en jeu', icon: Megaphone, permission: 'server.announce' },
    { to: '/admin/serveur/moderation', label: 'Modération', icon: ShieldAlert, permission: 'server.moderation' },
    { to: '/admin/serveur/sanctions', label: 'Sanctions', icon: Gavel, permission: 'server.moderation' },
    { to: '/admin/serveur/anti-triche', label: 'Anti-triche', icon: Radar, permission: 'server.moderation' },
    { to: '/admin/serveur/rcon', label: 'Console RCON', icon: Terminal, permission: 'server.rcon' },
  ]);
  const site = visible([
    { to: '/admin/site/pages', label: 'Pages', icon: FileText, permission: 'site.pages' },
    { to: '/admin/site/actualites', label: 'Actualités', icon: Newspaper, permission: 'site.news' },
    { to: '/admin/site/menu', label: 'Menu', icon: LayoutList, permission: 'site.appearance' },
    { to: '/admin/site/apparence', label: 'Apparence', icon: Palette, permission: 'site.appearance' },
    { to: '/admin/site/themes', label: 'Thèmes', icon: Sparkles, permission: 'site.appearance' },
    { to: '/admin/site/carte', label: 'Carte', icon: MapIcon, permission: 'site.map' },
    { to: '/admin/site/discord', label: 'Discord', icon: MessageSquare, permission: 'site.discord' },
    { to: '/admin/site/modules', label: 'Modules', icon: Blocks, permission: 'site.modules' },
    {
      to: '/admin/site/membres',
      label: 'Membres',
      icon: UsersRound,
      permission: 'site.members',
      badge: pending > 0 ? <Badge tone="amber">{pending}</Badge> : undefined,
    },
    {
      to: '/admin/site/signalements',
      label: 'Signalements',
      icon: Flag,
      permission: 'site.tickets',
      badge: openTickets > 0 ? <Badge tone="amber">{openTickets}</Badge> : undefined,
    },
  ]);
  const admin = visible([
    { to: '/admin/equipe', label: 'Équipe et rôles', icon: Shield, permission: 'admin.team' },
    { to: '/admin/journal', label: 'Journal des actions', icon: ScrollText, permission: 'admin.audit' },
    { to: '/admin/mises-a-jour', label: 'Mises à jour', icon: Download, permission: 'admin.updates' },
  ]);
  const extensions = visible([
    { to: '/admin/market', label: 'Market', icon: Store, permission: 'admin.extensions' },
    { to: '/admin/plugins', label: 'Plugins', icon: Puzzle, permission: 'admin.extensions' },
    ...registry.adminPages.filter((p) => !p.path.includes(':')).map((p) => ({ to: `/admin/plugins/${p.ext}/${p.path}`, label: p.label, icon: Puzzle, permission: p.permission })),
  ]);

  const nav = (
    <nav className="flex h-full flex-col gap-6 p-4">
      <Link to="/admin" className="flex items-center gap-2 px-3 text-lg font-bold">
        <span className="text-2xl">🐾</span> Panel admin
      </Link>
      <Section title="Gestion du serveur">{server.map(render)}</Section>
      {site.length > 0 && <Section title="Gestion du site">{site.map(render)}</Section>}
      {extensions.length > 0 && <Section title="Extensions">{extensions.map(render)}</Section>}
      <div className="mt-auto space-y-0.5 border-t border-slate-200 pt-4 dark:border-slate-800">
        {admin.map(render)}
        <Item to="/admin/compte" icon={UserCircle}>
          Mon compte
        </Item>
        <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
          <ExternalLink className="h-4 w-4" /> Voir le site
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-white dark:bg-slate-900">{nav}</aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
          <span className="truncate text-sm text-slate-500">{boot.site.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden text-sm font-medium sm:inline">{boot.user.displayName}</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
