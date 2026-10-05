# Building plugins and themes for PalCMS

🇫🇷 [Version française](README.fr.md)

An extension is a `.zip` file installed from the PalCMS panel: either in one click from the [market](https://palcms.online/), or with *Install a .zip file*.

- A **plugin** adds features: API routes, database tables, public pages, panel pages, blocks on the site.
- A **theme** changes the look: CSS, settings editable in the panel, header, footer and home page.

Two complete examples are a good starting point:

| Example | What it shows |
|---|---|
| [`examples/plugin-bandeau`](examples/plugin-bandeau) | announcement banner: settings, database table, API routes, block on every page, panel page, its own English / French texts |
| [`examples/theme-aurora`](examples/theme-aurora) | settings (colors, image, texts), replacing the header, the banner and the footer, PalCMS translations |

## Getting started

You need Node.js 20 or newer. In the PalCMS repository:

```bash
pnpm install
pnpm ext build sdk/examples/plugin-bandeau
```

Outside the repository, copy the `sdk/` folder, run `npm install` in it, then use `node palcms-ext.mjs build <folder>`.

The command creates `dist/` and the `<id>-<version>.zip` package, ready to install.

**While developing**, run PalCMS locally (`pnpm dev`), then:

```bash
pnpm ext build my-plugin --install apps/server/.data
```

The extension is dropped into the extensions folder of the local PalCMS. It shows up in *Admin panel > Extensions > Plugins* (or *Website > Themes*), turned off and marked "Not verified". Turn on *Allow unverified extensions* to enable it. After each change, run the command again and reload the page.

## Extension structure

```
my-plugin/
├── palcms.json        extension description (required)
├── src/
│   ├── server.js      server code (plugins only, optional)
│   ├── web.jsx        browser code (optional)
│   └── style.css      CSS (optional), with Tailwind
├── assets/            images, fonts… (optional)
└── README.md
```

`server`, `web` and `style` also accept TypeScript: `server.ts`, `web.tsx`, `web.ts`.

### palcms.json

```json
{
  "id": "my-plugin",
  "type": "plugin",
  "name": "My plugin",
  "version": "1.0.0",
  "description": "What the plugin does, in one or two sentences.",
  "author": "Your name",
  "homepage": "https://example.com",
  "palcms": ">=1.1.0",
  "icon": "assets/icon.png",
  "settings": [
    { "key": "title", "type": "text", "label": "Page title", "default": "Welcome" }
  ]
}
```

| Field | Role |
|---|---|
| `id` | unique id: 2 to 40 lowercase letters, digits or dashes. Never change it after publishing. |
| `type` | `plugin` or `theme` |
| `version` | `1.2.3` format. Increase it on every release: the market then offers the update. |
| `palcms` | compatible PalCMS versions: `>=1.1.0`, `>=1.1.0 <2.0.0` or `^1.1.0` |
| `icon` | square image (PNG, JPG or WebP) in `assets/` |
| `settings` | settings editable in the panel (see below) |

**Locked menu links (themes)**: a theme that lays out some links of the site menu itself can lock them with `"menu": { "fixed": [{ "url": "/news", "label": "News", "labelFr": "Actualités" }] }` (internal paths, 8 at most). While the theme is active, these links are always first in the menu, in this order, and the panel (*Website > Menu*) shows them locked: they can't be moved or deleted. Every other link stays editable, and the theme decides where to show it (for instance in a "More" menu).

**Setting types**: `text`, `textarea`, `number`, `toggle`, `color`, `image`, `select`. A `select` takes `"options": [{ "value": "a", "label": "Choice A" }]`.

## Server code (plugins)

`src/server.js` exports a function that receives the plugin API (`pal`):

```js
export default function myPlugin(pal) {
  // Tables: each migration runs only once. Prefix your tables with plugin_<id>_.
  pal.migrate([{ id: '001', sql: 'CREATE TABLE plugin_my_plugin_votes (user_id INTEGER, created_at INTEGER)' }]);

  // Route served under /api/plugins/my-plugin/votes
  pal.route({
    method: 'POST',
    path: 'votes',
    access: 'user', // public | user | staff
    handler: ({ user }) => {
      pal.host.db.prepare('INSERT INTO plugin_my_plugin_votes VALUES (?, ?)').run(user.id, Date.now());
      return { ok: true };
    },
  });

  pal.on('player:join', ({ name }) => pal.log(`${name} just arrived`));
  pal.every(60_000, () => { /* task every minute */ });
}
```

| API | Role |
|---|---|
| `pal.route({ method, path, access, permission?, handler })` | API route. `path` accepts parameters (`items/:id`). `access: 'staff'` + `permission` (e.g. `site.pages`) limits it to the team. To return an error: `throw Object.assign(new Error('Message'), { status: 400 })`. |
| `pal.migrate([{ id, sql }])` | SQL migrations (SQLite) |
| `pal.config()` | values of the `palcms.json` settings, edited in the panel. They are never sent to the browser: expose them with a route if needed. |
| `pal.settings.get(key, fallback)` / `set(key, value)` | small key / value store for the plugin |
| `pal.on(event, fn)` | `player:join`, `player:leave`, `server:online`, `server:offline`, `server:action`, `news:published`, `member:pending`, `tick`, `audit` |
| `pal.every(ms, fn)` | repeated task, stopped with the plugin |
| `pal.onStop(fn)` | cleanup when the plugin is turned off or updated |
| `pal.log(message)` | message in the CMS logs |
| `pal.host` | CMS services: `db`, `site.get()`, `server.status()`, `server.onlinePlayers()`, `palworld.announce(message)`, `events.emit('audit', …)`, `lang()` and `t(text, vars)` for the site language… (see `FeatureHost` in `packages/shared/src/features.ts`) |

A route handler receives `{ params, query, body, user, can(permission) }`. The plugin is turned on, off and updated without restarting the CMS. If it crashes while loading, the error is shown in the panel and the rest of the site keeps working.

npm dependencies imported in `server.js` are bundled into the package at build time.

## Browser code

`src/web.jsx` exports a function that receives the registration object (`pal`):

```jsx
import { useEffect, useState } from 'react';
import { Card, PageHeader, useApp } from '@palcms/sdk';

export default function myPlugin(pal) {
  function MyPage() {
    const [votes, setVotes] = useState([]);
    useEffect(() => { pal.api.get('votes').then(setVotes); }, []);
    return <Card title="Votes">{votes.length} votes</Card>;
  }

  pal.page({ path: 'votes', component: MyPage });                    // /votes on the site
  pal.adminPage({ path: 'settings', label: 'Votes', component: MyPage, permission: 'site.pages' });
  pal.widget('home.top', () => <p>Remember to vote!</p>);
}
```

| API | Role |
|---|---|
| `pal.page({ path, component, layout? })` | public page. `layout: false` shows it without the header and footer. Then add the link in *Website > Menu*. |
| `pal.adminPage({ path, label, component, permission? })` | panel page, under *Extensions*, at `/admin/plugins/<id>/<path>` |
| `pal.widget(slot, component, order?)` | block added to a slot: `layout.top`, `layout.bottom`, `home.top`, `home.bottom`, `footer`, `profile` |
| `pal.override(part, component)` | **themes only**: replaces `header`, `footer`, `home` or `home.hero` |
| `pal.api.get / post / put / del(path)` | calls the plugin routes (`/api/plugins/<id>/…`) |
| `pal.asset('image.png')` | URL of a file from `assets/` |
| `pal.settings` | settings of the active theme |

`react`, `react-router-dom` and `@palcms/sdk` are provided by the site: they are not bundled into the package, and the extension uses the same copy of React as PalCMS.

**`@palcms/sdk`** gives access to the site's building blocks:

- components: `Button`, `Card`, `Input`, `Textarea`, `Select`, `Field`, `Toggle`, `Badge`, `Alert`, `Spinner`, `PageHeader`, `Empty`, `Prose`, `ImageField`, `ThemeToggle`, `MenuLink`, `ServerStatusCard`, `OnlinePlayers`, `LeaderboardTable`, `StatusDot`, `CopyAddress`, `Slot`;
- default parts, to reuse in a theme: `DefaultHeader`, `DefaultFooter`, `DefaultHome`, `DefaultHomeHero`;
- hooks: `useApp()` (site, logged-in user, modules), `useLiveServer()` (live status and players), `useLoad(path)`, `useRealtime`, `useThemeSettings()`;
- tools: `api` (full CMS API), `url`, `cx`, `errorText`, `formatDate`, `formatDateTime`, `formatDuration`, `timeAgo`, `formatBytes`;
- languages (PalCMS 1.1.0+): `lang()` returns the visitor's language (`'en'` or `'fr'`), `t(text, vars)` translates a text known to PalCMS (`t('Log in')`, `t('{n} players', { n: 3 })`).

### Translating an extension

PalCMS is in English by default, with French available. Write your texts in English, then:

- for words PalCMS already uses (menu, status, buttons…), call `t()` from `@palcms/sdk`;
- for your own texts, keep a small dictionary and check `lang()`, as the banner example does:

```jsx
import { lang } from '@palcms/sdk';

const FR = { 'No click yet.': 'Aucun clic pour le moment.' };
const tr = (text) => (lang?.() === 'fr' && FR[text]) || text;
```

`lang?.()` keeps the extension working on PalCMS 1.0.x, where `lang` does not exist (it then stays in English). The labels of `palcms.json` settings are not translated: write them in English.

### Replacing a part of the site (themes)

The component receives the same data as the original version, plus `Default` to show it when needed:

| Part | Data received |
|---|---|
| `header`, `footer` | `site`, `menu`, `user`, `isAdmin`, `modules`, `logout()` |
| `home`, `home.hero` | `site`, `modules`, `live` (status and players), `news` (latest news) |

```jsx
function Header(props) {
  const s = useThemeSettings();
  if (s.style === 'classic') return <props.Default {...props} />;
  return <header>…</header>;
}
pal.override('header', Header);
```

Site addresses: `/news`, `/leaderboard`, `/map`, `/guilds`, `/paldex`, `/events`, `/uptime`, `/report`, `/login`, `/register`, `/profile`, `/p/<page>`. The "Join the server" button link is `site.joinUrl`.

## CSS and Tailwind

`src/style.css` is compiled with Tailwind and the site settings (`accent` color, `dark:` mode): use Tailwind classes directly in your JSX. Only classes the site doesn't have are added to the package. For raw CSS, build with `--no-tailwind`.

- Theme settings are available in CSS: `var(--theme-<key>)` (an image becomes `url(…)`, a toggle is `1` or `0`).
- The site main color: `var(--accent)` and `var(--accent-fg)`.
- A **theme**'s CSS doesn't apply to the admin panel. A **plugin**'s CSS applies everywhere: use class names specific to your plugin.

## Publishing on the market

1. Build the package and test it on a PalCMS.
2. Send the `.zip` on [palcms.online](https://palcms.online/) with a description and screenshots.
3. Once the team approves it, the package is signed: it appears in the market of every PalCMS, marked "Verified".

For an update, increase `version` in `palcms.json` and send the new package.

## Security

- A plugin runs with the same rights as the CMS: it can read the database and act on the game server. That's why the market reviews each resource before signing it.
- PalCMS refuses unsigned packages, unless the admin turns on *Allow unverified extensions*.
- A package may only contain `palcms.json`, `server.js`, `web.js`, `style.css`, `assets/`, `README`, `LICENSE` and `CHANGELOG`. It weighs 20 MB at most.
- Files in `assets/` are served publicly, `server.js` never. SVG and HTML files are not served.
