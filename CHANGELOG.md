# Changelog

🇫🇷 [Version française](CHANGELOG.fr.md)

## 1.1.1

**World data**
- Live read of the world save every 30 s while players are online: caught Pals show up in the Paldex and in the profile within a minute (setting in *Server > World data*, on by default)
- No forced save for the live read (the server autosaves on its own), and longer spacing on big worlds
- The profile, the Paldex and the guilds page refresh every 30 s while open

**Fixes**
- Unnamed save characters showed "Inconnu" instead of "Unknown"

## 1.1.0

**English and French**
- PalCMS is now in English by default, with a full French translation: setup wizard, public site, admin panel, error messages, Discord notifications and in-game announcements
- The site language is chosen in the setup wizard and can be changed in *Website > Appearance*; each visitor can switch with the EN / FR button (saved in their browser)
- Dates and numbers follow the chosen language
- Existing sites keep French: nothing changes until the language is switched

**English addresses**
- Public pages: `/news`, `/leaderboard`, `/map`, `/players/…`, `/guilds`, `/events`, `/uptime`, `/report`, `/login`, `/register`, `/profile`
- Admin panel: `/admin/server/…` and `/admin/site/…`
- Old French addresses keep working and redirect; the stored menu is converted automatically on first start
- New "Join the server" button link setting (*Website > Appearance*)

**Extensions**
- `lang()` and `t()` in `@palcms/sdk`: extensions can follow the visitor's language and reuse the PalCMS translations
- Example plugin (Announcement banner) and theme (Aurora) in English with French texts, using the new addresses

**Demo**
- The online demo is in English, with a FR button

**Fixes**
- Event changes ("Experience rate: x3") are shown in the visitor's language
- Some server error messages were not translated

**Code**
- Code comments, test names, scripts (`install.sh`, `palctl`, `palcms-config`) and documentation are in English; the French README is in `README.fr.md`

## 1.0.1

**Plugins and themes**
- Market in the panel (*Extensions > Market*): plugins and themes from palcms.online, filters, search, one-click install and update
- Every market resource is signed: PalCMS checks the signature and the checksum before installing
- *Plugins* page: turn on, turn off, configure, delete, install a .zip file. Plugins load without restarting the CMS, and an error in a plugin does not break the site
- *Themes* page: installed themes, activation and customization (colors, images, texts), on top of the existing advanced settings
- A plugin can add API routes, tables, public pages, panel pages and blocks on the site; a theme can replace the header, the footer and the home page
- Unsigned files are refused, unless the admin allows unverified extensions
- New "Plugins, themes and market" permission
- Creator kit (`sdk/`): package build with Tailwind, an example plugin (Announcement banner) and an example theme (Aurora), documentation
- Market API format and signing tools for palcms.online (`docs/market-api.md`)

## 1.0.0

First release.

**Install**
- One command on Ubuntu 22.04 / 24.04 (`install.sh`): IP or domain, root or sub-path (`/cms`), HTTPS with Let's Encrypt, self-signed or none
- Waits on its own for Ubuntu's automatic updates to finish on a brand new VPS
- Web wizard protected by a one-time token
- Your choice: install a new Palworld server, connect an existing server, or only the website (server connected later)
- `palcms-config` to change the address, the path or HTTPS afterwards
- Crossplay: the server shows up in the community server list (Xbox, Game Pass PC and PS5 cannot connect by IP)

**Public site**
- Home page, news, pages, editable menu, light / dark theme
- Live status and online players
- Live map: players, points of interest, guild bases, fast travel points and boss towers
- Leaderboard (level, playtime, seniority, buildings) and player profiles with charts
- Guilds: members, level, bases
- Paldex like a Pal box: the 288 Pals by number with their picture, silhouettes for the ones not caught yet, Paldex of the server, of each player and of each guild, collector rankings
- Events calendar with a countdown on the home page
- Uptime page (30 days, attendance by hour, next restart)
- Player accounts through Steam (approved automatically) or by email (approved by the team), with their Pals, inventory and guild
- Reports and suggestions sent to the team

**Admin panel**
- Server: dashboard, start / stop / restart, `PalWorldSettings.ini` editor, players, live logs, automatic backups with restore, scheduled restarts with announcements, in-game announcements, RCON console
- Monitoring: gauges (FPS, frame time, players, bases, CPU, memory, disk), alerts with adjustable thresholds, crash detection, 30-day history, one-click world save, clean shutdown with countdown
- Attendance statistics: peak hours, unique players, new players, returning players
- World data (reading saves with `sav_cli`): inventory, Pals and guild of each player, search an item across all players
- Events and presets: XP x3 weekend and other temporary settings put back at the end, Casual / Normal / Hard / x2 / x3 presets, configuration import / export (without passwords)
- Moderation: kick / ban / whitelist, warnings, private notes, temporary bans lifted automatically, history per player, light anti-cheat (levels, item amounts)
- Website: pages, news, menu, appearance, themes, map, Discord (notifications and alerts), modules, members, reports
- Automatic Palworld server updates and one-click PalCMS updates
- Team with roles (Administrator, Moderator, Editor + custom roles) and audit log

**Demo**
- Online demo at [demo.palcms.online](https://demo.palcms.online/): public site and admin panel with fake data, no server

**Security**
- The CMS does not run as root, system actions go through `palctl` (command whitelist)
- CSRF protection, HTML sanitized server-side, image checks, hashed passwords (scrypt)
