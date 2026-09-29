// Thème Aurora : remplace l'en-tête, le bandeau de l'accueil et le pied de page.
// Chaque composant reçoit "Default" pour réutiliser la version d'origine si besoin.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyAddress, MenuLink, StatusDot, useThemeSettings } from '@palcms/sdk';

function Header(props) {
  const s = useThemeSettings();
  const { site, menu, user, isAdmin, modules, logout, Default } = props;
  const [open, setOpen] = useState(false);
  // Aurora est un thème sombre : le mode sombre est imposé sur le site public.
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);
  if (s.headerStyle === 'classic') return <Default {...props} />;
  return (
    <header className="aurora-header sticky top-0 z-30">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-4">
        <Link to="/" className="flex items-center gap-3 text-xl font-extrabold tracking-tight">
          {site.logoUrl ? <img src={site.logoUrl} alt="" className="h-10 w-auto" /> : <span className="text-3xl">🐾</span>}
          <span className="aurora-text">{site.name}</span>
        </Link>
        <nav className="hidden flex-wrap items-center justify-center gap-1 md:flex">
          {menu.map((m) => (
            <MenuLink key={m.label + m.url} label={m.label} href={m.url} />
          ))}
          <span className="mx-2 h-5 w-px bg-white/15" />
          {isAdmin && <MenuLink label="Panel admin" href="/admin" />}
          {user ? (
            <>
              <MenuLink label={user.displayName} href="/profil" />
              <button onClick={() => void logout()} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">
                Déconnexion
              </button>
            </>
          ) : (
            modules.registration && <MenuLink label="Connexion" href="/connexion" />
          )}
        </nav>
        <button className="rounded-lg px-3 py-1 text-sm ring-1 ring-white/20 md:hidden" onClick={() => setOpen(!open)}>
          Menu
        </button>
        {open && (
          <nav className="flex w-full flex-col gap-1 md:hidden" onClick={() => setOpen(false)}>
            {menu.map((m) => (
              <MenuLink key={m.label + m.url} label={m.label} href={m.url} />
            ))}
            {isAdmin && <MenuLink label="Panel admin" href="/admin" />}
            {user ? <MenuLink label="Mon profil" href="/profil" /> : modules.registration && <MenuLink label="Connexion" href="/connexion" />}
          </nav>
        )}
      </div>
    </header>
  );
}

function Hero({ site, modules, live }) {
  const s = useThemeSettings();
  const status = live.status;
  return (
    <section className="aurora-hero relative overflow-hidden">
      {s.heroImage ? <img src={s.heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" /> : <div className="aurora-glow" />}
      <div className="relative mx-auto max-w-5xl px-4 py-24 text-center sm:py-32">
        <h1 className="aurora-text text-5xl font-black tracking-tight sm:text-6xl">{s.heroTitle || site.heroTitle || site.name}</h1>
        {(site.heroText || site.tagline) && <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">{site.heroText || site.tagline}</p>}
        {s.showStatus && modules.status && status && (
          <div className="mx-auto mt-8 inline-flex flex-wrap items-center justify-center gap-4 rounded-2xl bg-white/5 px-5 py-3 ring-1 ring-white/10 backdrop-blur">
            <span className="flex items-center gap-2 text-sm font-medium">
              <StatusDot online={status.online} /> {status.online ? 'En ligne' : 'Hors ligne'}
            </span>
            {status.online && (
              <span className="text-sm text-slate-300">
                {status.players}/{status.maxPlayers} joueurs
              </span>
            )}
            {status.address && <CopyAddress address={status.address} />}
          </div>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/p/rejoindre" className="aurora-button rounded-xl px-6 py-3 font-semibold text-slate-950 shadow-lg">
            Rejoindre le serveur
          </Link>
          {site.discordUrl && (
            <a href={site.discordUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl px-6 py-3 font-semibold ring-1 ring-white/20 hover:bg-white/5">
              Discord
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function Footer({ site, menu, modules }) {
  const s = useThemeSettings();
  return (
    <footer className="aurora-footer mt-8">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="aurora-text text-lg font-extrabold">{site.name}</p>
          <p className="mt-2 text-sm whitespace-pre-line text-slate-400">{s.footerText || site.footerText || site.tagline}</p>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">Navigation</p>
          <ul className="space-y-1 text-sm">
            {menu.slice(0, 8).map((m) => (
              <li key={m.label + m.url}>
                <Link to={m.url} className="text-slate-300 hover:text-white">
                  {m.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">Serveur</p>
          <ul className="space-y-1 text-sm">
            {modules.uptime && (
              <li>
                <Link to="/disponibilite" className="text-slate-300 hover:text-white">
                  Disponibilité
                </Link>
              </li>
            )}
            {modules.tickets && (
              <li>
                <Link to="/signaler" className="text-slate-300 hover:text-white">
                  Signaler un problème
                </Link>
              </li>
            )}
            {site.discordUrl && (
              <li>
                <a href={site.discordUrl} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white">
                  Discord
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-slate-500">Propulsé par PalCMS · Thème Aurora · Palworld est une marque de Pocketpair, Inc.</p>
    </footer>
  );
}

export default function aurora(pal) {
  pal.override('header', Header);
  pal.override('home.hero', Hero);
  pal.override('footer', Footer);
}
