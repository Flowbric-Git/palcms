# Créer des plugins et des thèmes pour PalCMS

🇬🇧 [English version](README.md)

Une extension est un fichier `.zip` qui s'installe depuis le panel de PalCMS : soit en un clic depuis le [market](https://palcms.online/), soit avec *Installer un fichier .zip*.

- Un **plugin** ajoute des fonctions : routes API, tables en base, pages publiques, pages dans le panel, blocs sur le site.
- Un **thème** change l'apparence : CSS, réglages modifiables dans le panel, en-tête, pied de page et accueil.

Deux exemples complets servent de point de départ :

| Exemple | Ce qu'il montre |
|---|---|
| [`examples/plugin-bandeau`](examples/plugin-bandeau) | bandeau d'annonce : réglages, table en base, routes API, bloc sur toutes les pages, page dans le panel, textes en anglais et en français |
| [`examples/theme-aurora`](examples/theme-aurora) | réglages (couleurs, image, textes), remplacement de l'en-tête, du bandeau et du pied de page, traductions de PalCMS |

## Démarrer

Il faut Node.js 20 ou plus récent. Dans le dépôt de PalCMS :

```bash
pnpm install
pnpm ext build sdk/examples/plugin-bandeau
```

Hors du dépôt, copie le dossier `sdk/` puis lance `npm install` dedans, et utilise `node palcms-ext.mjs build <dossier>`.

La commande crée `dist/` et le paquet `<id>-<version>.zip`, prêt à installer.

**Pour développer**, lance PalCMS en local (`pnpm dev`) puis :

```bash
pnpm ext build mon-plugin --install apps/server/.data
```

L'extension est déposée dans le dossier des extensions du PalCMS local. Elle apparaît dans *Panel admin > Extensions > Plugins* (ou *Site > Thèmes*), désactivée et marquée « Non vérifiée ». Active *Autoriser les extensions non vérifiées* pour l'activer. Après chaque modification, relance la commande puis recharge la page.

## Structure d'une extension

```
mon-plugin/
├── palcms.json        description de l'extension (obligatoire)
├── src/
│   ├── server.js      code serveur (plugins seulement, facultatif)
│   ├── web.jsx        code du navigateur (facultatif)
│   └── style.css      CSS (facultatif), avec Tailwind
├── assets/            images, polices… (facultatif)
└── README.md
```

`server`, `web` et `style` acceptent aussi TypeScript : `server.ts`, `web.tsx`, `web.ts`.

### palcms.json

```json
{
  "id": "mon-plugin",
  "type": "plugin",
  "name": "Mon plugin",
  "version": "1.0.0",
  "description": "Ce que fait le plugin, en une ou deux phrases.",
  "author": "Ton pseudo",
  "homepage": "https://exemple.fr",
  "palcms": ">=1.1.0",
  "icon": "assets/icon.png",
  "settings": [
    { "key": "titre", "type": "text", "label": "Titre de la page", "default": "Bienvenue" }
  ]
}
```

| Champ | Rôle |
|---|---|
| `id` | identifiant unique : 2 à 40 minuscules, chiffres ou tirets. Ne le change jamais après publication. |
| `type` | `plugin` ou `theme` |
| `version` | format `1.2.3`. Augmente-la à chaque publication : le market propose alors la mise à jour. |
| `palcms` | versions de PalCMS compatibles : `>=1.1.0`, `>=1.1.0 <2.0.0` ou `^1.1.0` |
| `icon` | image carrée (PNG, JPG ou WebP) dans `assets/` |
| `settings` | réglages modifiables dans le panel (voir plus bas) |

**Liens de menu verrouillés (thèmes)** : un thème qui met lui-même en page certains liens du menu du site peut les verrouiller avec `"menu": { "fixed": [{ "url": "/news", "label": "News", "labelFr": "Actualités" }] }` (adresses internes, 8 au maximum). Tant que le thème est actif, ces liens sont toujours en tête du menu, dans cet ordre, et le panel (*Site > Menu*) les affiche verrouillés : impossible de les déplacer ou de les supprimer. Tous les autres liens restent modifiables, et le thème choisit où les afficher (par exemple dans un menu « Plus »).

**Types de réglages** : `text`, `textarea`, `number`, `toggle`, `color`, `image`, `select`. Un `select` prend `"options": [{ "value": "a", "label": "Choix A" }]`.

## Code serveur (plugins)

`src/server.js` exporte une fonction qui reçoit l'API des plugins (`pal`) :

```js
export default function monPlugin(pal) {
  // Tables : chaque migration n'est jouée qu'une fois. Préfixe tes tables par plugin_<id>_.
  pal.migrate([{ id: '001', sql: 'CREATE TABLE plugin_mon_plugin_votes (user_id INTEGER, created_at INTEGER)' }]);

  // Route servie sous /api/plugins/mon-plugin/votes
  pal.route({
    method: 'POST',
    path: 'votes',
    access: 'user', // public | user | staff
    handler: ({ user }) => {
      pal.host.db.prepare('INSERT INTO plugin_mon_plugin_votes VALUES (?, ?)').run(user.id, Date.now());
      return { ok: true };
    },
  });

  pal.on('player:join', ({ name }) => pal.log(`${name} vient d'arriver`));
  pal.every(60_000, () => { /* tâche toutes les minutes */ });
}
```

| API | Rôle |
|---|---|
| `pal.route({ method, path, access, permission?, handler })` | route API. `path` accepte des paramètres (`items/:id`). `access: 'staff'` + `permission` (ex. `site.pages`) limite à l'équipe. Pour renvoyer une erreur : `throw Object.assign(new Error('Message'), { status: 400 })`. |
| `pal.migrate([{ id, sql }])` | migrations SQL (SQLite) |
| `pal.config()` | valeurs des réglages de `palcms.json`, modifiées dans le panel. Elles ne sont jamais envoyées au navigateur : expose-les avec une route si besoin. |
| `pal.settings.get(clé, défaut)` / `set(clé, valeur)` | petit stockage clé / valeur propre au plugin |
| `pal.on(événement, fn)` | `player:join`, `player:leave`, `server:online`, `server:offline`, `server:action`, `news:published`, `member:pending`, `tick`, `audit` |
| `pal.every(ms, fn)` | tâche répétée, arrêtée avec le plugin |
| `pal.onStop(fn)` | nettoyage quand le plugin est désactivé ou mis à jour |
| `pal.log(message)` | message dans les logs du CMS |
| `pal.host` | services du CMS : `db`, `site.get()`, `server.status()`, `server.onlinePlayers()`, `palworld.announce(message)`, `events.emit('audit', …)`, `lang()` et `t(texte, variables)` pour la langue du site… (voir `FeatureHost` dans `packages/shared/src/features.ts`) |

Le handler d'une route reçoit `{ params, query, body, user, can(permission) }`. Le plugin est activé, désactivé et mis à jour sans redémarrer le CMS. S'il plante au chargement, l'erreur s'affiche dans le panel et le reste du site continue de fonctionner.

Les dépendances npm importées dans `server.js` sont incluses dans le paquet par la construction.

## Code navigateur

`src/web.jsx` exporte une fonction qui reçoit l'objet d'enregistrement (`pal`) :

```jsx
import { useEffect, useState } from 'react';
import { Card, PageHeader, useApp } from '@palcms/sdk';

export default function monPlugin(pal) {
  function MaPage() {
    const [votes, setVotes] = useState([]);
    useEffect(() => { pal.api.get('votes').then(setVotes); }, []);
    return <Card title="Votes">{votes.length} votes</Card>;
  }

  pal.page({ path: 'votes', component: MaPage });                    // /votes sur le site
  pal.adminPage({ path: 'reglages', label: 'Votes', component: MaPage, permission: 'site.pages' });
  pal.widget('home.top', () => <p>Pense à voter !</p>);
}
```

| API | Rôle |
|---|---|
| `pal.page({ path, component, layout? })` | page publique. `layout: false` l'affiche sans l'en-tête ni le pied de page. Ajoute ensuite le lien dans *Site > Menu*. |
| `pal.adminPage({ path, label, component, permission? })` | page du panel, sous *Extensions*, à l'adresse `/admin/plugins/<id>/<path>` |
| `pal.widget(emplacement, composant, ordre?)` | bloc ajouté à un emplacement : `layout.top`, `layout.bottom`, `home.top`, `home.bottom`, `footer`, `profile` |
| `pal.override(partie, composant)` | **thèmes seulement** : remplace `header`, `footer`, `home` ou `home.hero` |
| `pal.api.get / post / put / del(chemin)` | appelle les routes du plugin (`/api/plugins/<id>/…`) |
| `pal.asset('image.png')` | URL d'un fichier de `assets/` |
| `pal.settings` | réglages du thème actif |

`react`, `react-router-dom` et `@palcms/sdk` sont fournis par le site : ils ne sont pas inclus dans le paquet et l'extension utilise la même copie de React que PalCMS.

**`@palcms/sdk`** donne accès aux éléments du site :

- composants : `Button`, `Card`, `Input`, `Textarea`, `Select`, `Field`, `Toggle`, `Badge`, `Alert`, `Spinner`, `PageHeader`, `Empty`, `Prose`, `ImageField`, `ThemeToggle`, `MenuLink`, `ServerStatusCard`, `OnlinePlayers`, `LeaderboardTable`, `StatusDot`, `CopyAddress`, `Slot` ;
- parties par défaut, à réutiliser dans un thème : `DefaultHeader`, `DefaultFooter`, `DefaultHome`, `DefaultHomeHero` ;
- hooks : `useApp()` (site, utilisateur connecté, modules), `useLiveServer()` (statut et joueurs en direct), `useLoad(chemin)`, `useRealtime`, `useThemeSettings()` ;
- outils : `api` (API complète du CMS), `url`, `cx`, `errorText`, `formatDate`, `formatDateTime`, `formatDuration`, `timeAgo`, `formatBytes` ;
- langues (PalCMS 1.1.0+) : `lang()` renvoie la langue du visiteur (`'en'` ou `'fr'`), `t(texte, variables)` traduit un texte connu de PalCMS (`t('Log in')`, `t('{n} players', { n: 3 })`).

### Traduire une extension

PalCMS est en anglais par défaut, avec le français disponible. Écris tes textes en anglais, puis :

- pour les mots que PalCMS utilise déjà (menu, statut, boutons…), appelle `t()` de `@palcms/sdk` ;
- pour tes propres textes, garde un petit dictionnaire et vérifie `lang()`, comme le fait l'exemple du bandeau :

```jsx
import { lang } from '@palcms/sdk';

const FR = { 'No click yet.': 'Aucun clic pour le moment.' };
const tr = (text) => (lang?.() === 'fr' && FR[text]) || text;
```

`lang?.()` garde l'extension compatible avec PalCMS 1.0.x, où `lang` n'existe pas (elle reste alors en anglais). Les libellés des réglages de `palcms.json` ne sont pas traduits : écris-les en anglais.

### Remplacer une partie du site (thèmes)

Le composant reçoit les mêmes données que la version d'origine, plus `Default` pour l'afficher si besoin :

| Partie | Données reçues |
|---|---|
| `header`, `footer` | `site`, `menu`, `user`, `isAdmin`, `modules`, `logout()` |
| `home`, `home.hero` | `site`, `modules`, `live` (statut et joueurs), `news` (dernières actualités) |

```jsx
function Header(props) {
  const s = useThemeSettings();
  if (s.style === 'classique') return <props.Default {...props} />;
  return <header>…</header>;
}
pal.override('header', Header);
```

Adresses du site : `/news`, `/leaderboard`, `/map`, `/guilds`, `/paldex`, `/events`, `/uptime`, `/report`, `/login`, `/register`, `/profile`, `/p/<page>`. Le lien du bouton « Rejoindre le serveur » est `site.joinUrl`.

## CSS et Tailwind

`src/style.css` est compilé avec Tailwind et les réglages du site (couleur `accent`, mode sombre `dark:`) : utilise directement les classes Tailwind dans ton JSX. Seules les classes absentes du site sont ajoutées au paquet. Pour un CSS brut, construis avec `--no-tailwind`.

- Les réglages d'un thème sont disponibles en CSS : `var(--theme-<clé>)` (une image devient `url(…)`, un interrupteur vaut `1` ou `0`).
- La couleur principale du site : `var(--accent)` et `var(--accent-fg)`.
- Le CSS d'un **thème** ne s'applique pas au panel admin. Celui d'un **plugin** s'applique partout : garde des noms de classes propres à ton plugin.

## Publier sur le market

1. Construis le paquet et teste-le sur un PalCMS.
2. Envoie le `.zip` sur [palcms.online](https://palcms.online/) avec une description et des captures.
3. Après validation par l'équipe, le paquet est signé : il apparaît dans le market de tous les PalCMS, marqué « Vérifié ».

Pour une mise à jour, augmente `version` dans `palcms.json` et envoie le nouveau paquet.

## Sécurité

- Un plugin s'exécute avec les mêmes droits que le CMS : il peut lire la base et agir sur le serveur de jeu. C'est pourquoi le market vérifie chaque ressource avant de la signer.
- PalCMS refuse les paquets non signés, sauf si l'admin active *Autoriser les extensions non vérifiées*.
- Un paquet ne peut contenir que `palcms.json`, `server.js`, `web.js`, `style.css`, `assets/`, `README`, `LICENSE` et `CHANGELOG`. Il pèse 20 Mo au maximum.
- Les fichiers de `assets/` sont servis publiquement, `server.js` jamais. Les SVG et HTML ne sont pas servis.
