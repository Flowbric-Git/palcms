// Construit l'archive de distribution : release/palcms.tar.gz
// Contenu : serveur compilé, site compilé (carte comprise), scripts système.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'release');
const stage = path.join(out, 'palcms');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const serverPkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/server/package.json'), 'utf8'));

console.log('▶ Compilation');
run('pnpm build');

console.log('▶ Préparation de l’archive');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'server'), { recursive: true });
fs.cpSync(path.join(root, 'apps/server/dist'), path.join(stage, 'server/dist'), { recursive: true });
fs.cpSync(path.join(root, 'apps/web/dist'), path.join(stage, 'web/dist'), { recursive: true });
fs.mkdirSync(path.join(stage, 'scripts'));
for (const f of ['palctl', 'palcms-config']) fs.copyFileSync(path.join(root, 'scripts', f), path.join(stage, 'scripts', f));
fs.copyFileSync(path.join(root, 'install.sh'), path.join(stage, 'install.sh'));
fs.writeFileSync(path.join(stage, 'VERSION'), rootPkg.version + '\n');

// package.json de production : uniquement les dépendances d'exécution (le paquet partagé est dans le bundle).
const prodPkg = {
  name: '@palcms/server',
  version: rootPkg.version,
  private: true,
  type: 'module',
  main: 'dist/index.js',
  dependencies: serverPkg.dependencies,
};
fs.writeFileSync(path.join(stage, 'server/package.json'), JSON.stringify(prodPkg, null, 2));
// Verrouille les versions exactes pour "npm ci" sur le VPS.
execSync('npm install --package-lock-only --omit=dev --no-audit --no-fund --loglevel=error', {
  cwd: path.join(stage, 'server'),
  stdio: 'inherit',
});

// tar est livré avec Windows 10+ et avec Linux / macOS.
execSync('tar -czf palcms.tar.gz palcms', { cwd: out, stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'install.sh'), path.join(out, 'install.sh'));
const size = (fs.statSync(path.join(out, 'palcms.tar.gz')).size / 1024 / 1024).toFixed(1);
console.log(`✔ release/palcms.tar.gz (${size} Mo) et release/install.sh prêts`);
