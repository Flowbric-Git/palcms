# PalCMS

🇫🇷 [Version française](README.md)

**Free, open-source website + admin panel for Palworld dedicated servers.** One command on a VPS installs the site; the site then installs the game server and gives you:

- **a public website for your players**: home page, news, pages, live server status and online players, **live map** (players, bases, fast travel points), **leaderboard**, **guilds**, **server Paldex**, **events calendar**, **uptime page**, player profiles with charts, player accounts (Steam or email) showing their Pals and inventory, **reports and suggestions**;
- **an admin panel** with two areas:
  - **Server**: dashboard, **monitoring** (gauges, alerts, history), **attendance statistics**, start / stop / restart, `PalWorldSettings.ini` editor, **events and presets**, players, **world data** (inventories, Pals, guilds, item search), live logs, backups, scheduled restarts, **automatic server updates**, in-game announcements, moderation, **sanctions**, **light anti-cheat**, RCON console;
  - **Website**: pages, news, menu, appearance and themes, map, Discord (notifications and alerts), modules, members, reports;
- **a plugin and theme market**: one-click install, verified and signed packages, and a [creator kit](sdk/README.md) to build your own;
- **one-click PalCMS updates** from the panel;
- **a team with roles** (Administrator, Moderator, Editor, custom roles) and an **audit log**.

**Already running a server?** Connect it through its REST API, no reinstall needed.

> The PalCMS interface (website and panel) is currently in **French**. The public pages you write (news, rules, menu…) can be in any language.

**MIT** license, see [LICENSE](LICENSE). Release history: [CHANGELOG.md](CHANGELOG.md).

🌐 Website: **[palcms.online](https://palcms.online/)** · ✉️ Contact: [contact@flowbric.fr](mailto:contact@flowbric.fr)

## Demo

👉 **[Try the demo](https://demo.palcms.online/)** · [open the admin panel directly](https://demo.palcms.online/admin)

The demo runs entirely in your browser with fake data (simulated players, no real Palworld server). You can change anything: your changes stay in your browser, and the "Réinitialiser" (reset) button starts over. You can even install and enable the example plugin and theme from the market.

| Public site | Live map |
|---|---|
| ![Home](docs/screenshots/accueil.png) | ![Map](docs/screenshots/carte.png) |
| **Leaderboard** | **Admin panel** |
| ![Leaderboard](docs/screenshots/classement.png) | ![Admin panel](docs/screenshots/admin.png) |
| **Paldex** | |
| ![Paldex](docs/screenshots/paldex.png) | |

---

## Installing on a VPS

**Requirements**
- Ubuntu **22.04** or **24.04**, **x86_64** CPU.
- **8 GB of RAM for the Palworld server**, 16 GB recommended above 8 players. PalCMS itself is lightweight: if you connect an existing server or only install the website, 1 GB is enough.
- 15 GB of free disk space.
- Root access (`sudo`).

**Install command**

```bash
curl -fsSL https://github.com/Flowbric-Git/palcms/releases/latest/download/install.sh | sudo bash
```

The script asks these questions in the terminal:

| Question | Example | Default |
|---|---|---|
| Domain name (empty = VPS IP) | `myserver.com` | detected IP |
| Site path | `/cms` → `https://IP/cms` | `/` |
| HTTPS | `letsencrypt` (domain), `selfsigned` or `none` | `letsencrypt` with a domain, `selfsigned` with an IP |
| Internal CMS port | `3000` | `3000` |

Each question has a matching option, for unattended installs:

```bash
curl -fsSL https://github.com/Flowbric-Git/palcms/releases/latest/download/install.sh | sudo bash -s -- --domain myserver.com --https letsencrypt --email you@example.com -y
```

At the end, the script prints the setup wizard address (`…/setup`) and a **one-time setup token**. The web wizard then walks you through:

1. entering the token;
2. **choosing the server**:
   - **install a new Palworld server** on this VPS: a form, then SteamCMD and the server are installed with a live log;
   - **connect an existing server** (on this VPS or elsewhere): address and port of its REST API, admin password, connection test;
   - **website only**: connect a server later from *Panel admin > Connexion au serveur*;
3. creating the administrator account;
4. the site's look;
5. finishing, then redirecting to the site.

**Existing server**: its REST API must be enabled (`RESTAPIEnabled=True`) and reachable from the site's VPS. Status, players, map, leaderboard, statistics, moderation, announcements, Discord and RCON (if you give its port) all work. Start/stop, the config editor, logs, backups and scheduled restarts are reserved for a server installed by PalCMS, since they act directly on the server machine.

> If your host has an external firewall, open the **game port in UDP** (8211 by default, plus 27015 for the community server list) and ports **80/443 in TCP**.

**Useful commands**

```bash
sudo palcms-config edit           # change the domain, path, HTTPS or port
sudo palcms-config show           # show the configuration
sudo journalctl -u palcms -f      # CMS logs
sudo journalctl -u palworld -f    # Palworld server logs
sudo cat /var/lib/palcms/setup-token   # find the setup token again
```

- **Updating**: click "Mettre à jour" in the panel, or run the install command again. The code is replaced, your data (`/var/lib/palcms`) is kept.
- **World backups** are stored in `/var/lib/palworld-backups`.

---

## Plugins and themes

The panel includes a **Market** (*Extensions > Market*): each resource is reviewed and then signed on [palcms.online](https://palcms.online/market), and PalCMS checks that signature before installing it. Plugins are enabled and disabled in *Extensions > Plugins*; themes are chosen and customized in *Gestion du site > Thèmes*. A `.zip` file can also be installed directly; if it doesn't come from the market, the admin must first allow unverified extensions.

- **Build a plugin or a theme**: [sdk/README.md](sdk/README.md) (in French), with an example plugin and theme.
- **Market API format**: [docs/market-api.md](docs/market-api.md).

---

## Security

- The CMS runs as the **`palcms`** system user, never as root. Its code (`/opt/palcms`) is owned by root and can't be modified by the CMS.
- System actions go **only** through `/usr/local/lib/palcms/palctl`, the only script allowed in sudoers. It accepts a fixed list of commands and validates every argument (ports, backup names…).
- The Palworld server runs as the `steam` user. Its REST API (port 8212) and RCON port stay **local**: the firewall never opens them.
- The setup wizard requires a one-time token, then locks itself for good.
- Passwords hashed with scrypt, `HttpOnly` / `SameSite=Lax` session cookies (`Secure` over HTTPS), request origin checks (CSRF) and login rate limiting.
- Each team member only sees and does what their role allows, and every action is written to the audit log.
- Page HTML is sanitized server-side, and uploaded images are checked by their signature (no SVG).
- The public site never exposes players' Steam IDs or IPs.

---

## Development

**Requirements**: Node.js ≥ 20.12, pnpm 9 and Git. Everything works on Windows, macOS or Linux, without a VPS or a Palworld server.

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts four processes:

| Process | Role |
|---|---|
| `api` | Fastify server on http://127.0.0.1:3000 |
| `web` | React site (Vite) on **http://localhost:5173** |
| `palworld` | fake Palworld server: simulated REST API with players who move and level up |
| `market` | fake market on http://127.0.0.1:3100: the example extensions, signed with a dev key |

The setup token is printed in the console. The fake `palctl` (`tools/fake-palctl`) simulates the install and backups without touching your machine.

| Command | Role |
|---|---|
| `pnpm test` | unit tests |
| `pnpm typecheck` | TypeScript checks |
| `pnpm dev:reset` | start again from a blank install |
| `pnpm release` | builds `release/palcms.tar.gz` and `release/install.sh` |
| `pnpm --filter @palcms/web dev:demo` | runs the demo (no server) on http://localhost:5173/ |
| `pnpm --filter @palcms/web build:demo` | builds the demo into `apps/web/dist-demo` (static files to host) |
| `pnpm ext build <folder>` | builds an extension (plugin or theme) into a .zip package |

Test an archive on a VPS: `sudo bash install.sh --from-local palcms.tar.gz`.

**Publishing a version**: push a `v1.2.3` tag. The GitHub Actions workflow tests, builds and publishes the release, with its notes taken from `release-notes/v1.2.3.md`.

---

Palworld is a trademark of Pocketpair, Inc. PalCMS is an independent project, not affiliated with Pocketpair. The included map remains © Pocketpair: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
