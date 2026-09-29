import { db } from '../db';

/** Contenu de départ créé à la fin de l'installation (uniquement s'il n'existe pas déjà). */
export function seedContent(authorId: number | null, discordUrl: string): void {
  const now = Date.now();
  const insertPage = db.prepare(
    'INSERT OR IGNORE INTO pages (slug, title, content_html, published, updated_at) VALUES (?, ?, ?, 1, ?)',
  );
  insertPage.run(
    'regles',
    'Règles du serveur',
    `<h2>Règles générales</h2>
<ol>
<li>Respecte les autres joueurs : pas d'insultes ni de harcèlement.</li>
<li>Pas de triche, d'exploit de bug ou de logiciel tiers.</li>
<li>Ne détruis pas les bases des autres joueurs sans leur accord.</li>
<li>Écoute les décisions des administrateurs.</li>
</ol>
<p>Ces règles sont modifiables dans le panel admin, rubrique <em>Gestion du site &gt; Pages</em>.</p>`,
    now,
  );
  insertPage.run(
    'rejoindre',
    'Rejoindre le serveur',
    `<h2>Comment nous rejoindre</h2>
<ol>
<li>Lance Palworld et choisis <strong>Rejoindre une partie multijoueur</strong>.</li>
<li>En bas de l'écran, saisis l'adresse du serveur affichée sur l'accueil du site.</li>
<li>Entre le mot de passe si le serveur en a un.</li>
</ol>
${discordUrl ? `<p>Rejoins aussi notre <a href="${encodeURI(discordUrl).replace(/"/g, '%22')}">Discord</a> !</p>` : ''}`,
    now,
  );

  const hasNews = db.prepare('SELECT 1 FROM news LIMIT 1').get();
  if (!hasNews) {
    db.prepare(
      `INSERT INTO news (slug, title, excerpt, content_html, published, published_at, author_id, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      'ouverture-du-serveur',
      'Ouverture du serveur !',
      'Le serveur est en ligne. Bienvenue à toutes et à tous !',
      '<p>Le serveur est officiellement ouvert. Connecte-toi, capture tes premiers Pals et viens grimper dans le classement !</p>',
      now,
      authorId,
      now,
    );
  }
}
