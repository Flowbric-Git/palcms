// Côté navigateur : le bandeau en haut de toutes les pages et une page de statistiques dans le panel.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, PageHeader, Spinner, formatDate, isExternal } from '@palcms/sdk';

const STYLES = {
  accent: 'bg-accent text-accent-fg',
  info: 'bg-sky-600 text-white',
  warning: 'bg-amber-500 text-slate-950',
  danger: 'bg-red-600 text-white',
};

// Clé propre au message : un nouveau message réapparaît même si l'ancien a été fermé.
const dismissKey = (message) => `palcms-bandeau:${message.length}:${message.slice(0, 40)}`;

export default function bandeau(pal) {
  function Banner() {
    const [data, setData] = useState(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
      pal.api
        .get('config')
        .then((d) => {
          if (!d) return;
          try {
            if (d.dismissible && localStorage.getItem(dismissKey(d.message))) return;
          } catch {
            // stockage indisponible (navigation privée) : on affiche le bandeau
          }
          setData(d);
        })
        .catch(() => {});
    }, []);

    if (!data || hidden) return null;

    const close = () => {
      setHidden(true);
      try {
        localStorage.setItem(dismissKey(data.message), '1');
      } catch {
        // tant pis, il réapparaîtra au prochain chargement
      }
    };
    const click = () => void pal.api.post('clicks').catch(() => {});
    const linkClass = 'shrink-0 rounded-md bg-black/15 px-3 py-1 text-xs font-semibold hover:bg-black/25';

    return (
      <div className={`${STYLES[data.style] ?? STYLES.accent} text-sm`}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <p className="flex-1 text-center font-medium">{data.message}</p>
          {data.link &&
            (isExternal(data.link) ? (
              <a href={data.link} target="_blank" rel="noopener noreferrer" onClick={click} className={linkClass}>
                {data.linkLabel}
              </a>
            ) : (
              <Link to={data.link} onClick={click} className={linkClass}>
                {data.linkLabel}
              </Link>
            ))}
          {data.dismissible && (
            <button onClick={close} className="shrink-0 rounded-md px-2 py-1 text-base leading-none opacity-80 hover:opacity-100" aria-label="Fermer le bandeau">
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  function StatsPage() {
    const [stats, setStats] = useState(null);
    useEffect(() => {
      pal.api.get('stats').then(setStats).catch(() => setStats({ total: 0, days: [] }));
    }, []);
    const max = Math.max(1, ...(stats?.days ?? []).map((d) => d.clicks));
    return (
      <>
        <PageHeader
          title="Bandeau d'annonce"
          description="Clics sur le bouton du bandeau, jour par jour. Le message et la couleur se règlent dans Extensions > Plugins > Bandeau d'annonce (icône Réglages)."
        />
        {!stats ? (
          <Spinner />
        ) : stats.days.length === 0 ? (
          <Empty>Aucun clic pour le moment.</Empty>
        ) : (
          <Card title={`${stats.total} clic${stats.total > 1 ? 's' : ''} sur les 30 derniers jours`}>
            <ul className="space-y-2">
              {stats.days.map((d) => (
                <li key={d.day} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-slate-500">{formatDate(new Date(`${d.day}T12:00:00`).getTime())}</span>
                  <span className="h-2 rounded-full bg-accent" style={{ width: `${(d.clicks / max) * 70}%` }} />
                  <span className="font-medium">{d.clicks}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  pal.widget('layout.top', Banner);
  pal.adminPage({ path: 'statistiques', label: "Bandeau d'annonce", component: StatsPage, permission: 'site.appearance' });
}
