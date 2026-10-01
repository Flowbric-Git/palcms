# Announcement banner (example plugin)

🇫🇷 [Version française](README.fr.md)

Shows a banner at the top of every page of the site: event, maintenance, wipe, Discord link… The message, the link, the color, the end date and whether visitors can close it are set in *Admin panel > Extensions > Plugins > Announcement banner* (Settings icon). Clicks on the button are counted day by day in *Extensions > Announcement banner*.

This plugin shows:
- settings editable in the panel (`palcms.json` > `settings`, read on the server with `pal.config()`);
- a database table (`pal.migrate`) and API routes, public and team-only (`pal.route`);
- a block on every page (`pal.widget('layout.top', …)`) and a page in the panel (`pal.adminPage`);
- the plugin's own texts in English and French, following the visitor's language (`lang()` from `@palcms/sdk`, PalCMS 1.1.0+);
- Tailwind classes specific to the plugin (`src/style.css`).
