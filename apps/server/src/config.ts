import fs from 'node:fs';
import path from 'node:path';
import { normalizeBasePath } from '@palcms/shared';

const devEnvFile = path.resolve(process.cwd(), '.env.development');
if (process.env.NODE_ENV !== 'production' && fs.existsSync(devEnvFile)) {
  process.loadEnvFile(devEnvFile);
}

const env = process.env;

export const config = {
  isProd: env.NODE_ENV === 'production',
  version: env.PALCMS_VERSION ?? '1.2.0',
  host: env.HOST ?? '127.0.0.1',
  port: Number(env.PORT ?? 3000),
  basePath: normalizeBasePath(env.BASE_PATH ?? '/'),
  /** Public origin of the site, without the path (e.g. https://1.2.3.4 or https://myserver.com). */
  publicUrl: (env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  dataDir: path.resolve(env.DATA_DIR ?? './.data'),
  webDist: path.resolve(env.WEB_DIST ?? '../web/dist'),
  setupTokenFile: env.SETUP_TOKEN_FILE ? path.resolve(env.SETUP_TOKEN_FILE) : '',
  /** Command that runs palctl; in production: sudo -n /usr/local/lib/palcms/palctl */
  palctl: (env.PALCTL ?? 'sudo -n /usr/local/lib/palcms/palctl').split(' ').filter(Boolean),
  palworldApiHost: env.PALWORLD_API_HOST ?? '127.0.0.1',
  pollIntervalMs: Math.max(2000, Number(env.POLL_INTERVAL_MS ?? 5000)),
  /** Plugin and theme market API. */
  marketUrl: (env.PALCMS_MARKET_URL ?? 'https://palcms.online/api/market').replace(/\/+$/, ''),
  /** Extra public keys accepted for signatures (.pem files separated by commas). */
  trustedKeyFiles: (env.PALCMS_TRUSTED_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
};

export const secureCookies = config.publicUrl.startsWith('https://');
export const setupTokenPath = config.setupTokenFile || path.join(config.dataDir, 'setup-token');
export const uploadsDir = path.join(config.dataDir, 'uploads');
