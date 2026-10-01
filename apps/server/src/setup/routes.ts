import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  adminSetupSchema,
  connectionTestSchema,
  externalServerSchema,
  palworldSetupSchema,
  serverModeSchema,
  setupTokenSchema,
  siteSetupSchema,
  type ExternalServer,
  type ServerMode,
  type SetupState,
  type SetupStep,
} from '@palcms/shared';
import { settings } from '../db';
import { startFeatures } from '../features/runtime';
import { realtime } from '../core/realtime';
import { modules } from '../core/modules';
import { seedContent } from '../core/seed';
import { saveImageUpload } from '../core/uploads';
import {
  getPalworldConfig,
  defaultSite,
  getSiteSettings,
  isSetupDone,
  saveExternalServer,
  savePalworldConfig,
  saveSiteSettings,
  setServerMode,
} from '../core/site';
import { testConnection } from '../palworld/restClient';
import { hashPassword } from '../auth/password';
import { createSession } from '../auth/sessions';
import { createUser, emailTaken, usernameTaken } from '../auth/users';
import { poller } from '../palworld/poller';
import { DbTaskStore } from './store';
import { CONFIG_DEPENDENT_STEPS, INSTALL_STEPS } from './steps';
import { TaskRunner } from './taskRunner';
import { SETUP_COOKIE, checkSetupToken, grantSetupSession, hasSetupSession, removeSetupToken } from './token';
import { cookieOptions } from '../auth/sessions';

const store = new DbTaskStore();
export const setupRunner = new TaskRunner(store, INSTALL_STEPS, (ev) => realtime.broadcast('setup', ev));

realtime.setHooks('setup', { snapshot: () => setupRunner.state().map((t) => ({ type: 'task' as const, data: t })) });

const getStep = () => settings.get<SetupStep>('setup.step', 'mode');
/** Mode chosen during setup (null until the question is asked). */
const chosenMode = () => settings.get<ServerMode | null>('server.mode', null);
const setStep = (s: SetupStep) => settings.set('setup.step', s);

function state(req: FastifyRequest): SetupState {
  const done = isSetupDone();
  const authorized = !done && hasSetupSession(req);
  return {
    done,
    authorized,
    step: done ? 'finish' : authorized ? getStep() : 'token',
    installing: setupRunner.running,
    tasks: authorized ? setupRunner.state() : [],
    mode: authorized ? chosenMode() : null,
    serverForm: authorized ? (getPalworldConfig() as Record<string, unknown> | null) : null,
    externalForm: authorized ? settings.get<ExternalServer | null>('palworld.external', null) : null,
  };
}

function fail(reply: FastifyReply, code: number, error: string, details?: unknown) {
  return reply.code(code).send({ error, details });
}

export async function setupRoutes(app: FastifyInstance) {
  // Every route (except state and token) needs the setup session, and nothing is possible once finished.
  app.addHook('preHandler', async (req, reply) => {
    const route = req.routeOptions.url ?? '';
    if (route.endsWith('/state')) return;
    if (isSetupDone()) return fail(reply, 410, 'Setup is already finished');
    if (route.endsWith('/token')) return;
    if (!hasSetupSession(req)) return fail(reply, 401, 'Setup token required');
  });

  app.get('/state', async (req) => state(req));

  app.post('/token', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = setupTokenSchema.safeParse(req.body);
    if (!body.success || !checkSetupToken(body.data.token)) return fail(reply, 403, 'Invalid token');
    grantSetupSession(reply);
    if (!settings.get('setup.step', null)) setStep('mode');
    return { ok: true };
  });

  /* First question: install a new server, connect an existing server, or the website only. */
  app.post('/mode', async (req, reply) => {
    const step = getStep();
    const canChoose = ['mode', 'server', 'external'].includes(step) || (step === 'install' && !setupRunner.running);
    if (!canChoose) return fail(reply, 409, 'The server choice can no longer be changed at this step');
    const body = serverModeSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Invalid choice');
    setServerMode(body.data.mode);
    setStep(body.data.mode === 'managed' ? 'server' : body.data.mode === 'external' ? 'external' : 'admin');
    return { ok: true };
  });

  app.post('/connection/test', async (req, reply) => {
    const body = connectionTestSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Invalid form', body.error.flatten());
    return testConnection({ host: body.data.apiHost, port: body.data.apiPort, password: body.data.adminPassword });
  });

  app.post('/external', async (req, reply) => {
    if (getStep() !== 'external') return fail(reply, 409, 'This is not the existing server step');
    const body = externalServerSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Invalid form', body.error.flatten());
    saveExternalServer(body.data);
    setStep('admin');
    return { ok: true };
  });

  app.post('/server', async (req, reply) => {
    if (chosenMode() !== 'managed') return fail(reply, 409, 'Installing a server was not chosen');
    const step = getStep();
    const canEdit = step === 'server' || (step === 'install' && !setupRunner.running && !setupRunner.allDone());
    if (!canEdit) return fail(reply, 409, 'The server can no longer be changed at this step');
    const body = palworldSetupSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Invalid form', body.error.flatten());
    savePalworldConfig(body.data);
    store.reset(CONFIG_DEPENDENT_STEPS);
    setStep('install');
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/logs/:id', async (req) => ({ log: store.getLog(req.params.id) }));

  app.post('/install', async (req, reply) => {
    if (getStep() !== 'install') return fail(reply, 409, 'This is not the install step');
    if (setupRunner.running) return fail(reply, 409, 'Install already running');
    void setupRunner.runAll().then((ok) => {
      if (ok) setStep('admin');
    });
    return { ok: true };
  });

  app.post('/admin', async (req, reply) => {
    if (getStep() !== 'admin') return fail(reply, 409, 'This is not the administrator account step');
    const body = adminSetupSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Invalid form', body.error.flatten());
    const { username, email, password } = body.data;
    if (usernameTaken(username) || emailTaken(email)) return fail(reply, 409, 'This account already exists');
    const id = createUser({
      username,
      displayName: username,
      email,
      passwordHash: await hashPassword(password),
      role: 'superadmin',
      status: 'active',
    });
    createSession(reply, id);
    settings.set('setup.adminId', id);
    setStep('site');
    return { ok: true };
  });

  app.post('/upload', async (req, reply) => {
    const file = await req.file();
    if (!file) return fail(reply, 400, 'No file');
    try {
      return { url: await saveImageUpload(file) };
    } catch (e) {
      return fail(reply, 400, (e as Error).message);
    }
  });

  app.post('/site', async (req, reply) => {
    if (getStep() !== 'site') return fail(reply, 409, 'This is not the website step');
    const body = siteSetupSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Invalid form', body.error.flatten());
    const current = getSiteSettings();
    const defaults = defaultSite(body.data.language);
    // Texts still at a default value (in either language) switch to the chosen language.
    const untouched = <K extends 'heroTitle' | 'heroText' | 'joinUrl'>(key: K) =>
      current[key] === defaultSite('en')[key] || current[key] === defaultSite('fr')[key];
    const sameMenu = (a: { url: string }[], b: { url: string }[]) => JSON.stringify(a.map((m) => m.url)) === JSON.stringify(b.map((m) => m.url));
    const menu = sameMenu(current.menu, defaultSite('en').menu) || sameMenu(current.menu, defaultSite('fr').menu) ? defaults.menu : [...current.menu];
    if (body.data.discordUrl && !menu.some((m) => m.label === 'Discord')) menu.push({ label: 'Discord', url: body.data.discordUrl });
    saveSiteSettings({
      ...current,
      ...body.data,
      heroTitle: untouched('heroTitle') ? defaults.heroTitle : current.heroTitle,
      heroText: untouched('heroText') ? defaults.heroText : current.heroText,
      joinUrl: untouched('joinUrl') ? defaults.joinUrl : current.joinUrl,
      menu,
    });
    setStep('finish');
    return { ok: true };
  });

  app.post('/finish', async (req, reply) => {
    if (getStep() !== 'finish') return fail(reply, 409, 'Not every step is finished');
    modules.installAll();
    seedContent(settings.get<number | null>('setup.adminId', null), getSiteSettings().discordUrl, getSiteSettings().language);
    settings.set('setup.done', true);
    removeSetupToken();
    reply.clearCookie(SETUP_COOKIE, cookieOptions());
    startFeatures();
    poller.start();
    return { ok: true };
  });
}
