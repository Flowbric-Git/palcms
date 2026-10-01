// Browser side: the banner at the top of every page and a statistics page in the panel.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, PageHeader, Spinner, formatDate, isExternal, lang } from '@palcms/sdk';

const STYLES = {
  accent: 'bg-accent text-accent-fg',
  info: 'bg-sky-600 text-white',
  warning: 'bg-amber-500 text-slate-950',
  danger: 'bg-red-600 text-white',
};

// The plugin's own French texts. lang() exists since PalCMS 1.1.0: older versions stay in English.
const FR = {
  'Close the banner': 'Fermer le bandeau',
  'Announcement banner': "Bandeau d'annonce",
  'Clicks on the banner button, day by day. The message and the color are set in Extensions > Plugins > Announcement banner (Settings icon).':
    "Clics sur le bouton du bandeau, jour par jour. Le message et la couleur se règlent dans Extensions > Plugins > Bandeau d'annonce (icône Réglages).",
  'No click yet.': 'Aucun clic pour le moment.',
  '{n} click(s) over the last 30 days': '{n} clic(s) sur les 30 derniers jours',
};
const t = (text, vars = {}) =>
  (lang?.() === 'fr' ? FR[text] ?? text : text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

// Key tied to the message: a new message shows up again even if the old one was closed.
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
            // storage unavailable (private browsing): show the banner
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
        // never mind, it will show up again on the next load
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
            <button onClick={close} className="shrink-0 rounded-md px-2 py-1 text-base leading-none opacity-80 hover:opacity-100" aria-label={t('Close the banner')}>
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
          title={t('Announcement banner')}
          description={t(
            'Clicks on the banner button, day by day. The message and the color are set in Extensions > Plugins > Announcement banner (Settings icon).',
          )}
        />
        {!stats ? (
          <Spinner />
        ) : stats.days.length === 0 ? (
          <Empty>{t('No click yet.')}</Empty>
        ) : (
          <Card title={t('{n} click(s) over the last 30 days', { n: stats.total })}>
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
  pal.adminPage({ path: 'stats', label: t('Announcement banner'), component: StatsPage, permission: 'site.appearance' });
}
