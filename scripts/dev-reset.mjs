// Resets the development environment (database, token, fake Palworld server).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of ['apps/server/.data', 'tools/.dev-data']) {
  fs.rmSync(path.join(root, dir), { recursive: true, force: true });
  console.log(`deleted: ${dir}`);
}
console.log('Run "pnpm dev" again: a new setup token will be shown.');
