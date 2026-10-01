#!/usr/bin/env node
// PalCMS extension kit: builds, packages and signs plugins and themes.
// Documentation : sdk/README.md

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { zipSync } from 'fflate';
import { transform } from 'lightningcss';

const SDK_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

// Modules provided by the site (window.PalCMS.modules): they are not bundled into web.js.
const SHARED = {
  react: [
    'Children', 'Component', 'Fragment', 'PureComponent', 'StrictMode', 'Suspense', 'cloneElement', 'createContext',
    'createElement', 'createRef', 'forwardRef', 'isValidElement', 'lazy', 'memo', 'startTransition', 'use',
    'useActionState', 'useCallback', 'useContext', 'useDebugValue', 'useDeferredValue', 'useEffect', 'useId',
    'useImperativeHandle', 'useInsertionEffect', 'useLayoutEffect', 'useMemo', 'useOptimistic', 'useReducer', 'useRef',
    'useState', 'useSyncExternalStore', 'useTransition', 'version',
  ],
  'react/jsx-runtime': ['jsx', 'jsxs', 'Fragment'],
  'react-dom': ['createPortal', 'flushSync'],
  'react-router-dom': [
    'Link', 'NavLink', 'Navigate', 'Outlet', 'Route', 'Routes', 'generatePath', 'matchPath', 'useLocation', 'useMatch',
    'useNavigate', 'useOutletContext', 'useParams', 'useSearchParams',
  ],
  '@palcms/sdk': [
    'version', 'api', 'url', 'basePath', 'errorText', 'isExternal', 'cx', 'useApp', 'useLiveServer', 'useLoad',
    'useRealtime', 'useThemeSettings', 'formatBytes', 'formatDate', 'formatDateTime', 'formatDuration', 'timeAgo', 'lang', 't',
    'Alert', 'Badge', 'Button', 'Card', 'Empty', 'Field', 'Input', 'PageHeader', 'Prose', 'Select', 'Spinner',
    'Textarea', 'Toggle', 'ImageField', 'ThemeToggle', 'CopyAddress', 'LeaderboardTable', 'OnlinePlayers',
    'ServerStatusCard', 'StatusDot', 'MenuLink', 'DefaultHeader', 'DefaultFooter', 'DefaultHome', 'DefaultHomeHero',
    'Slot', 'ExtensionBoundary',
  ],
};
SHARED['react-router'] = SHARED['react-router-dom'];

const sharedModules = {
  name: 'palcms-shared',
  setup(build) {
    const filter = new RegExp(`^(${Object.keys(SHARED).map((k) => k.replace(/[/.]/g, '\\$&')).join('|')})$`);
    build.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'palcms-shared' }));
    build.onLoad({ filter: /.*/, namespace: 'palcms-shared' }, (args) => ({
      loader: 'js',
      contents: [
        `const m = window.PalCMS.modules[${JSON.stringify(args.path)}];`,
        'export default m.default ?? m;',
        `export const { ${SHARED[args.path].join(', ')} } = m;`,
      ].join('\n'),
    }));
  },
};

function die(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function readManifest(dir) {
  const file = path.join(dir, 'palcms.json');
  if (!fs.existsSync(file)) die(`palcms.json not found in ${dir}`);
  let m;
  try {
    m = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    die(`invalid palcms.json: ${e.message}`);
  }
  if (!ID_RE.test(m.id ?? '')) die('palcms.json: "id" must have 2 to 40 lowercase letters, digits or dashes');
  if (!['plugin', 'theme'].includes(m.type)) die('palcms.json: "type" must be "plugin" or "theme"');
  if (!m.name) die('palcms.json: "name" is required');
  if (!VERSION_RE.test(m.version ?? '')) die('palcms.json: "version" must use the 1.2.3 format');
  return m;
}

const firstExisting = (dir, names) => names.map((n) => path.join(dir, n)).find((f) => fs.existsSync(f));

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true, filter: (src) => !/(^|[\\/])(\.DS_Store|Thumbs\.db)$/.test(src) });
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

// Main class of a Tailwind selector (.md\:flex:hover -> md:flex).
function selectorClass(selector) {
  return selector.find((part) => part.type === 'class')?.name;
}

/** Classes already generated in the site CSS (sdk/site-classes.json, updated when PalCMS is built). */
function siteClasses() {
  try {
    return new Set(JSON.parse(fs.readFileSync(path.join(SDK_DIR, 'site-classes.json'), 'utf8')));
  } catch {
    return new Set();
  }
}

/**
 * Removes from the extension CSS the classes the site already provides: declared again after the site CSS,
 * they would break the order of its classes (e.g. hidden would override lg:block).
 */
function withoutSiteClasses(file) {
  const known = siteClasses();
  if (known.size === 0) return;
  const { code } = transform({
    filename: file,
    code: fs.readFileSync(file),
    minify: true,
    visitor: {
      Rule: {
        style(rule) {
          const all = rule.value.selectors.every((sel) => known.has(selectorClass(sel)));
          return all ? [] : undefined;
        },
      },
    },
  });
  fs.writeFileSync(file, code);
}

function writeSiteClasses(args) {
  const dir = path.resolve(args[0] ?? '../apps/web/dist/assets');
  const files = fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => path.join(dir, f)) : [dir];
  const classes = new Set();
  for (const file of files) {
    transform({
      filename: file,
      code: fs.readFileSync(file),
      visitor: {
        Rule: {
          style(rule) {
            for (const sel of rule.value.selectors) {
              const c = selectorClass(sel);
              if (c) classes.add(c);
            }
          },
        },
      },
    });
  }
  fs.writeFileSync(path.join(SDK_DIR, 'site-classes.json'), `${JSON.stringify([...classes].sort())}\n`);
  console.log(`✔ ${classes.size} site classes saved in sdk/site-classes.json`);
}

function buildCss(dir, out, tailwind) {
  const src = path.join(dir, 'src', 'style.css');
  const target = path.join(out, 'style.css');
  if (!fs.existsSync(src)) return false;
  if (!tailwind) {
    fs.copyFileSync(src, target);
    return true;
  }
  // The Tailwind classes used in src/ are generated with the site settings.
  const entry = path.join(dir, 'src', '.palcms-style.css');
  const slash = (p) => p.split(path.sep).join('/');
  fs.writeFileSync(
    entry,
    `@import "${slash(path.join(SDK_DIR, 'tailwind.css'))}";\n@source "${slash(path.join(dir, 'src'))}";\n${fs.readFileSync(src, 'utf8')}`,
  );
  try {
    const cli = path.join(path.dirname(require.resolve('@tailwindcss/cli/package.json')), 'dist', 'index.mjs');
    const res = spawnSync(process.execPath, [cli, '-i', entry, '-o', target, '--minify'], { cwd: SDK_DIR, stdio: 'pipe', encoding: 'utf8' });
    if (res.status !== 0) die(`Tailwind: ${res.stderr || res.stdout}`);
    withoutSiteClasses(target);
  } finally {
    fs.rmSync(entry, { force: true });
  }
  return true;
}

async function build(args) {
  const tailwind = !args.includes('--no-tailwind');
  const installTo = flag(args, '--install');
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.');
  const manifest = readManifest(dir);
  const out = path.join(dir, 'dist');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const serverEntry = firstExisting(path.join(dir, 'src'), ['server.ts', 'server.js', 'server.mjs']);
  const webEntry = firstExisting(path.join(dir, 'src'), ['web.tsx', 'web.jsx', 'web.ts', 'web.js']);
  if (manifest.type === 'theme' && serverEntry) die('A theme cannot have server code (src/server.*)');

  if (serverEntry) {
    await esbuild.build({
      entryPoints: [serverEntry],
      outfile: path.join(out, 'server.js'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      // For CommonJS dependencies bundled into the package.
      banner: { js: "import { createRequire as __palcmsRequire } from 'node:module'; const require = __palcmsRequire(import.meta.url);" },
      logLevel: 'warning',
    });
  }
  if (webEntry) {
    await esbuild.build({
      entryPoints: [webEntry],
      outfile: path.join(out, 'web.js'),
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2020',
      jsx: 'automatic',
      minify: true,
      plugins: [sharedModules],
      loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' },
      logLevel: 'warning',
    });
  }
  const hasCss = buildCss(dir, out, tailwind);
  // An "import './x.css'" in web.* produces web.css: it is merged into style.css.
  const webCss = path.join(out, 'web.css');
  if (fs.existsSync(webCss)) {
    fs.appendFileSync(path.join(out, 'style.css'), `\n${fs.readFileSync(webCss, 'utf8')}`);
    fs.rmSync(webCss);
  }
  if (!serverEntry && !webEntry && !hasCss && !fs.existsSync(path.join(out, 'style.css'))) {
    die('Nothing to build: add src/web.jsx, src/server.js or src/style.css');
  }

  copyDir(path.join(dir, 'assets'), path.join(out, 'assets'));
  for (const f of ['README.md', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md']) {
    if (fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), path.join(out, f));
  }
  if (manifest.icon && !fs.existsSync(path.join(out, manifest.icon))) die(`Icon not found: ${manifest.icon}`);
  fs.writeFileSync(path.join(out, 'palcms.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const files = {};
  const mtime = new Date('2020-01-01T00:00:00Z');
  for (const f of listFiles(out)) files[f] = [fs.readFileSync(path.join(out, f)), { mtime }];
  const zip = zipSync(files, { level: 9 });
  const zipFile = path.join(dir, `${manifest.id}-${manifest.version}.zip`);
  fs.writeFileSync(zipFile, zip);

  console.log(`✔ ${manifest.type === 'theme' ? 'Theme' : 'Plugin'} ${manifest.name} ${manifest.version}`);
  console.log(`  ${Object.keys(files).join(', ')}`);
  console.log(`  → ${path.relative(process.cwd(), zipFile)} (${(zip.byteLength / 1024).toFixed(1)} KB)`);

  if (installTo) {
    // Development: drops the extension into the folder of a local PalCMS (it shows up in the panel).
    const target = path.join(path.resolve(installTo), 'extensions', manifest.id);
    fs.rmSync(target, { recursive: true, force: true });
    copyDir(out, target);
    console.log(`  installed in ${target}`);
  }
}

function keygen(args) {
  const dir = path.resolve(args[0] ?? '.');
  fs.mkdirSync(dir, { recursive: true });
  const priv = path.join(dir, 'market-private.pem');
  if (fs.existsSync(priv)) die(`${priv} already exists: not overwriting it`);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'market-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`✔ Keys created in ${dir}\n  Keep market-private.pem secret: it alone can sign packages.`);
}

function sign(args) {
  const key = flag(args, '--key');
  const download = flag(args, '--download');
  const file = args[0];
  if (!file || !key) die('Usage: palcms-ext sign <package.zip> --key market-private.pem [--download https://…/package.zip]');
  const data = fs.readFileSync(file);
  const signature = crypto.sign(null, data, crypto.createPrivateKey(fs.readFileSync(key))).toString('base64');
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  // The manifest is read again from the zip to prefill the catalogue entry.
  const { unzipSync } = require('fflate');
  const entries = unzipSync(new Uint8Array(data), { filter: (f) => /(^|\/)palcms\.json$/.test(f.name) });
  const raw = Object.values(entries)[0];
  const m = raw ? JSON.parse(Buffer.from(raw).toString('utf8')) : {};
  const entry = {
    id: m.id,
    type: m.type,
    name: m.name,
    summary: m.description ?? '',
    author: m.author ?? '',
    version: m.version,
    ...(m.palcms ? { palcms: m.palcms } : {}),
    download: download ?? `https://palcms.online/market/files/${path.basename(file)}`,
    sha256,
    signature,
  };
  console.log(JSON.stringify(entry, null, 2));
}

function verify(args) {
  const pub = flag(args, '--pub');
  const sig = flag(args, '--sig');
  const file = args[0];
  if (!file || !pub || !sig) die('Usage: palcms-ext verify <package.zip> --pub market-public.pem --sig <base64 signature>');
  const ok = crypto.verify(null, fs.readFileSync(file), crypto.createPublicKey(fs.readFileSync(pub)), Buffer.from(sig, 'base64'));
  console.log(ok ? '✔ Valid signature' : '✖ Invalid signature');
  process.exit(ok ? 0 : 1);
}

const HELP = `palcms-ext: PalCMS extension kit

  build <folder> [--install <data folder>] [--no-tailwind]
      Builds the extension (src/ → dist/) and creates <id>-<version>.zip.
      --install also copies the result to <data>/extensions/<id> (development).

  keygen <folder>             Creates a signing key pair (for the market).
  sign <zip> --key <pem>      Signs a package and prints its entry for the market catalogue.
  verify <zip> --pub <pem> --sig <signature>
  site-classes <css folder>   Lists the site classes (PalCMS build).
`;

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'build':
    await build(args);
    break;
  case 'keygen':
    keygen(args);
    break;
  case 'sign':
    sign(args);
    break;
  case 'site-classes':
    writeSiteClasses(args);
    break;
  case 'verify':
    verify(args);
    break;
  default:
    console.log(HELP);
    if (cmd && cmd !== 'help' && cmd !== '--help') process.exit(1);
}
