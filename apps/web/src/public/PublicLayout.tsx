import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogIn, LogOut, Menu, User, X } from 'lucide-react';
import { api, isExternal } from '../lib/api';
import { useApp } from '../lib/app';
import { ThemeToggle } from '../components/ThemeToggle';
import { cx } from '../components/ui';

function MenuLink({ label, href, onClick }: { label: string; href: string; onClick?: () => void }) {
  const cls = 'rounded-lg px-3 py-2 text-sm font-medium transition';
  if (isExternal(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cx(cls, 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white')}>
        {label}
      </a>
    );
  }
  return (
    <NavLink
      to={href}
      end={href === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        cx(cls, isActive ? 'bg-accent/10 text-accent' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white')
      }
    >
      {label}
    </NavLink>
  );
}

export function PublicLayout() {
  const { boot, isAdmin, setUser } = useApp();
  const { site, user, modules } = boot;
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const logout = async () => {
    await api.post('auth/logout');
    setUser(null);
    navigate('/');
  };

  // Un lien vers une page dont le module est désactivé est masqué du menu.
  const MODULE_OF: Record<string, string> = {
    '/actualites': 'news',
    '/classement': 'leaderboard',
    '/guildes': 'guilds',
    '/paldex': 'paldex',
    '/evenements': 'calendar',
    '/disponibilite': 'uptime',
    '/signaler': 'tickets',
  };
  const menu = site.menu.filter((m) => !MODULE_OF[m.url] || modules[MODULE_OF[m.url]]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            {site.logoUrl ? <img src={site.logoUrl} alt="" className="h-9 w-auto" /> : <span className="text-2xl">🐾</span>}
            <span className="hidden sm:inline">{site.name}</span>
          </Link>

          <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            {menu.map((m) => (
              <MenuLink key={m.label + m.url} label={m.label} href={m.url} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {isAdmin && (
              <Link to="/admin" className="hidden items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg sm:flex">
                <LayoutDashboard className="h-4 w-4" /> Panel admin
              </Link>
            )}
            {user ? (
              <>
                <Link to="/profil" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" /> : <User className="h-5 w-5" />}
                  <span className="hidden lg:inline">{user.displayName}</span>
                </Link>
                <button onClick={() => void logout()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Déconnexion" aria-label="Déconnexion">
                  <LogOut className="h-5 w-5" />
                </button>
              </>
            ) : (
              modules.registration && (
                <Link to="/connexion" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                  <LogIn className="h-4 w-4" /> Connexion
                </Link>
              )
            )}
            <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 px-4 py-3 md:hidden dark:border-slate-800">
            {menu.map((m) => (
              <MenuLink key={m.label + m.url} label={m.label} href={m.url} onClick={() => setOpen(false)} />
            ))}
            {isAdmin && <MenuLink label="Panel admin" href="/admin" onClick={() => setOpen(false)} />}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-800">
        <p>{site.footerText || `© ${new Date().getFullYear()} ${site.name}`}</p>
        {(modules.uptime || modules.tickets) && (
          <p className="mt-2 flex justify-center gap-4">
            {modules.uptime && (
              <Link to="/disponibilite" className="hover:text-accent">
                Disponibilité du serveur
              </Link>
            )}
            {modules.tickets && (
              <Link to="/signaler" className="hover:text-accent">
                Signaler un problème
              </Link>
            )}
          </p>
        )}
        <p className="mt-1 text-xs opacity-70">Propulsé par PalCMS · Palworld est une marque de Pocketpair, Inc.</p>
      </footer>
    </div>
  );
}
