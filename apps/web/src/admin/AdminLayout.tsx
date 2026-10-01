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
import { t } from '../lib/i18n';
import { LanguageSwitch } from '../components/LanguageSwitch';

export { useLoad } from '../lib/useLoad';

interface NavEntry {
  to: string;
  label: string;
  icon: typeof Gauge;
  /** Without a permission: visible to the whole team. */
  permission?: Permission;
  /** Only for a server installed and run by PalCMS (hidden for an external server). */
  managedOnly?: boolean;
  badge?: ReactNode;
}

function Item({ to, icon: Icon, children, badge }: { to: string; icon: typeof Gauge; children: ReactNode; badge?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/admin/server'}
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
  // Public site themes (background, custom CSS) do not apply to the panel.
  useEffect(() => {
    document.body.classList.add('palcms-admin');
    // Nor does the installed theme's CSS.
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

  if (!boot.user) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">{t('Administrators only.')}</p>
        <Link to="/" className="text-accent">
          {t('Back to the site')}
        </Link>
      </div>
    );
  }

  // Each team member only sees the sections their role allows (labels are translated here).
  const perms = new Set(boot.user.permissions);
  const managed = boot.serverMode === 'managed';
  const visible = (list: NavEntry[]) => list.filter((e) => (!e.permission || perms.has(e.permission)) && (managed || !e.managedOnly));
  const render = (e: NavEntry) => (
    <Item key={e.to} to={e.to} icon={e.icon} badge={e.badge}>
      {t(e.label)}
    </Item>
  );

  const server = visible([
    { to: '/admin/server', label: 'Dashboard', icon: Gauge },
    { to: '/admin/server/monitoring', label: 'Monitoring', icon: Activity, permission: 'server.players' },
    { to: '/admin/server/stats', label: 'Statistics', icon: BarChart3, permission: 'server.players' },
    { to: '/admin/server/connection', label: 'Server connection', icon: PlugZap, permission: 'server.config' },
    { to: '/admin/server/config', label: 'Configuration', icon: Settings2, permission: 'server.config', managedOnly: true },
    { to: '/admin/server/events', label: 'Events', icon: PartyPopper, permission: 'server.events', managedOnly: true },
    { to: '/admin/server/players', label: 'Players', icon: Users, permission: 'server.players' },
    { to: '/admin/server/world', label: 'World data', icon: Globe, permission: 'server.world', managedOnly: true },
    { to: '/admin/server/logs', label: 'Logs', icon: ScrollText, permission: 'server.logs', managedOnly: true },
    { to: '/admin/server/backups', label: 'Backups', icon: Archive, permission: 'server.backups', managedOnly: true },
    { to: '/admin/server/schedules', label: 'Schedules', icon: CalendarClock, permission: 'server.schedules', managedOnly: true },
    { to: '/admin/server/announcements', label: 'In-game announcements', icon: Megaphone, permission: 'server.announce' },
    { to: '/admin/server/moderation', label: 'Moderation', icon: ShieldAlert, permission: 'server.moderation' },
    { to: '/admin/server/sanctions', label: 'Sanctions', icon: Gavel, permission: 'server.moderation' },
    { to: '/admin/server/anti-cheat', label: 'Anti-cheat', icon: Radar, permission: 'server.moderation' },
    { to: '/admin/server/rcon', label: 'RCON console', icon: Terminal, permission: 'server.rcon' },
  ]);
  const site = visible([
    { to: '/admin/site/pages', label: 'Pages', icon: FileText, permission: 'site.pages' },
    { to: '/admin/site/news', label: 'News', icon: Newspaper, permission: 'site.news' },
    { to: '/admin/site/menu', label: 'Menu', icon: LayoutList, permission: 'site.appearance' },
    { to: '/admin/site/appearance', label: 'Appearance', icon: Palette, permission: 'site.appearance' },
    { to: '/admin/site/themes', label: 'Themes', icon: Sparkles, permission: 'site.appearance' },
    { to: '/admin/site/map', label: 'Map', icon: MapIcon, permission: 'site.map' },
    { to: '/admin/site/discord', label: 'Discord', icon: MessageSquare, permission: 'site.discord' },
    { to: '/admin/site/modules', label: 'Modules', icon: Blocks, permission: 'site.modules' },
    {
      to: '/admin/site/members',
      label: 'Members',
      icon: UsersRound,
      permission: 'site.members',
      badge: pending > 0 ? <Badge tone="amber">{pending}</Badge> : undefined,
    },
    {
      to: '/admin/site/reports',
      label: 'Reports',
      icon: Flag,
      permission: 'site.tickets',
      badge: openTickets > 0 ? <Badge tone="amber">{openTickets}</Badge> : undefined,
    },
  ]);
  const admin = visible([
    { to: '/admin/team', label: 'Team and roles', icon: Shield, permission: 'admin.team' },
    { to: '/admin/audit', label: 'Audit log', icon: ScrollText, permission: 'admin.audit' },
    { to: '/admin/updates', label: 'Updates', icon: Download, permission: 'admin.updates' },
  ]);
  const extensions = visible([
    { to: '/admin/market', label: 'Market', icon: Store, permission: 'admin.extensions' },
    { to: '/admin/plugins', label: 'Plugins', icon: Puzzle, permission: 'admin.extensions' },
    ...registry.adminPages.filter((p) => !p.path.includes(':')).map((p) => ({ to: `/admin/plugins/${p.ext}/${p.path}`, label: p.label, icon: Puzzle, permission: p.permission })),
  ]);

  const nav = (
    <nav className="flex h-full flex-col gap-6 p-4">
      <Link to="/admin" className="flex items-center gap-2 px-3 text-lg font-bold">
        <span className="text-2xl">🐾</span> {t('Admin panel')}
      </Link>
      <Section title={t('Server')}>{server.map(render)}</Section>
      {site.length > 0 && <Section title={t('Website')}>{site.map(render)}</Section>}
      {extensions.length > 0 && <Section title={t('Extensions')}>{extensions.map(render)}</Section>}
      <div className="mt-auto space-y-0.5 border-t border-slate-200 pt-4 dark:border-slate-800">
        {admin.map(render)}
        <Item to="/admin/account" icon={UserCircle}>
          {t('My account')}
        </Item>
        <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
          <ExternalLink className="h-4 w-4" /> {t('View the site')}
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
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label={t('Menu')}>
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
          <span className="truncate text-sm text-slate-500">{boot.site.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
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
