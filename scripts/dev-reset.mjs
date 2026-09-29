// Remet l'environnement de développement à zéro (base, jeton, faux serveur Palworld).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of ['apps/server/.data', 'tools/.dev-data']) {
  fs.rmSync(path.join(root, dir), { recursive: true, force: true });
  console.log(`supprimé : ${dir}`);
}
console.log("Relance « pnpm dev » : un nouveau jeton d'installation s'affichera.");
