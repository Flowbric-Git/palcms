import type { Lang } from '@palcms/shared';
import { db } from '../db';

interface SeedPage {
  slug: string;
  title: string;
  html: (discord: string) => string;
}

const discordLink = (url: string, text: string) =>
  url ? `<p>${text.replace('{link}', `<a href="${encodeURI(url).replace(/"/g, '%22')}">Discord</a>`)}</p>` : '';

const CONTENT: Record<Lang, { pages: SeedPage[]; news: { slug: string; title: string; excerpt: string; html: string } }> = {
  en: {
    pages: [
      {
        slug: 'rules',
        title: 'Server rules',
        html: () => `<h2>General rules</h2>
<ol>
<li>Respect other players: no insults or harassment.</li>
<li>No cheating, bug exploits or third-party software.</li>
<li>Don't destroy other players' bases without their consent.</li>
<li>Follow the administrators' decisions.</li>
</ol>
<p>These rules can be edited in the admin panel, under <em>Website &gt; Pages</em>.</p>`,
      },
      {
        slug: 'join',
        title: 'Join the server',
        html: (discord) => `<h2>How to join us</h2>
<ol>
<li>Start Palworld and choose <strong>Join Multiplayer Game</strong>.</li>
<li>At the bottom of the screen, enter the server address shown on the site's home page.</li>
<li>Enter the password if the server has one.</li>
</ol>
${discordLink(discord, 'Join our {link} too!')}`,
      },
    ],
    news: {
      slug: 'server-launch',
      title: 'The server is open!',
      excerpt: 'The server is online. Welcome, everyone!',
      html: '<p>The server is officially open. Log in, catch your first Pals and climb the leaderboard!</p>',
    },
  },
  fr: {
    pages: [
      {
        slug: 'regles',
        title: 'Règles du serveur',
        html: () => `<h2>Règles générales</h2>
<ol>
<li>Respecte les autres joueurs : pas d'insultes ni de harcèlement.</li>
<li>Pas de triche, d'exploit de bug ou de logiciel tiers.</li>
<li>Ne détruis pas les bases des autres joueurs sans leur accord.</li>
<li>Écoute les décisions des administrateurs.</li>
</ol>
<p>Ces règles sont modifiables dans le panel admin, rubrique <em>Gestion du site &gt; Pages</em>.</p>`,
      },
      {
        slug: 'rejoindre',
        title: 'Rejoindre le serveur',
        html: (discord) => `<h2>Comment nous rejoindre</h2>
<ol>
<li>Lance Palworld et choisis <strong>Rejoindre une partie multijoueur</strong>.</li>
<li>En bas de l'écran, saisis l'adresse du serveur affichée sur l'accueil du site.</li>
<li>Entre le mot de passe si le serveur en a un.</li>
</ol>
${discordLink(discord, 'Rejoins aussi notre {link} !')}`,
      },
    ],
    news: {
      slug: 'ouverture-du-serveur',
      title: 'Ouverture du serveur !',
      excerpt: 'Le serveur est en ligne. Bienvenue à toutes et à tous !',
      html: '<p>Le serveur est officiellement ouvert. Connecte-toi, capture tes premiers Pals et viens grimper dans le classement !</p>',
    },
  },
};

/** Starter content created at the end of setup, in the site language (only if it does not exist yet). */
export function seedContent(authorId: number | null, discordUrl: string, lang: Lang): void {
  const now = Date.now();
  const content = CONTENT[lang];
  const insertPage = db.prepare(
    'INSERT OR IGNORE INTO pages (slug, title, content_html, published, updated_at) VALUES (?, ?, ?, 1, ?)',
  );
  for (const page of content.pages) insertPage.run(page.slug, page.title, page.html(discordUrl), now);

  const hasNews = db.prepare('SELECT 1 FROM news LIMIT 1').get();
  if (!hasNews) {
    const n = content.news;
    db.prepare(
      `INSERT INTO news (slug, title, excerpt, content_html, published, published_at, author_id, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(n.slug, n.title, n.excerpt, n.html, now, authorId, now);
  }
}
