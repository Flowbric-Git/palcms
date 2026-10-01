// Server side: the settings the browser needs and a click counter per day.
// Routes are served under /api/plugins/bandeau/…

export default function bandeau(pal) {
  pal.migrate([
    {
      id: '001-clics',
      sql: 'CREATE TABLE plugin_bandeau_clicks (day TEXT PRIMARY KEY, clicks INTEGER NOT NULL DEFAULT 0)',
    },
  ]);

  const db = pal.host.db;
  const today = () => new Date().toISOString().slice(0, 10);

  // The banner to show, or null when it is empty or expired.
  pal.route({
    method: 'GET',
    path: 'config',
    access: 'public',
    handler: () => {
      const c = pal.config();
      const message = String(c.message ?? '').trim();
      if (!message) return null;
      if (c.until && today() > String(c.until)) return null;
      return { message, link: c.link || null, linkLabel: c.linkLabel || 'Learn more', style: c.style, dismissible: c.dismissible !== false };
    },
  });

  pal.route({
    method: 'POST',
    path: 'clicks',
    access: 'public',
    handler: () => {
      db.prepare(
        'INSERT INTO plugin_bandeau_clicks (day, clicks) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET clicks = clicks + 1',
      ).run(today());
      return { ok: true };
    },
  });

  pal.route({
    method: 'GET',
    path: 'stats',
    access: 'staff',
    permission: 'site.appearance',
    handler: () => {
      const days = db.prepare('SELECT day, clicks FROM plugin_bandeau_clicks ORDER BY day DESC LIMIT 30').all();
      return { total: days.reduce((n, d) => n + d.clicks, 0), days };
    },
  });
}
