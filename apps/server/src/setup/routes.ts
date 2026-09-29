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
/** Mode choisi pendant l'installation (null tant que la question n'a pas été posée). */
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
  // Toutes les routes (sauf état et jeton) exigent la session d'installation, et plus rien n'est possible une fois fini.
  app.addHook('preHandler', async (req, reply) => {
    const route = req.routeOptions.url ?? '';
    if (route.endsWith('/state')) return;
    if (isSetupDone()) return fail(reply, 410, "L'installation est déjà terminée");
    if (route.endsWith('/token')) return;
    if (!hasSetupSession(req)) return fail(reply, 401, "Jeton d'installation requis");
  });

  app.get('/state', async (req) => state(req));

  app.post('/token', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = setupTokenSchema.safeParse(req.body);
    if (!body.success || !checkSetupToken(body.data.token)) return fail(reply, 403, 'Jeton invalide');
    grantSetupSession(reply);
    if (!settings.get('setup.step', null)) setStep('mode');
    return { ok: true };
  });

  /* Première question : installer un nouveau serveur, connecter un serveur existant, ou le site seul. */
  app.post('/mode', async (req, reply) => {
    const step = getStep();
    const canChoose = ['mode', 'server', 'external'].includes(step) || (step === 'install' && !setupRunner.running);
    if (!canChoose) return fail(reply, 409, 'Le choix du serveur ne peut plus être modifié à cette étape');
    const body = serverModeSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Choix invalide');
    setServerMode(body.data.mode);
    setStep(body.data.mode === 'managed' ? 'server' : body.data.mode === 'external' ? 'external' : 'admin');
    return { ok: true };
  });

  app.post('/connection/test', async (req, reply) => {
    const body = connectionTestSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Formulaire invalide', body.error.flatten());
    return testConnection({ host: body.data.apiHost, port: body.data.apiPort, password: body.data.adminPassword });
  });

  app.post('/external', async (req, reply) => {
    if (getStep() !== 'external') return fail(reply, 409, "Ce n'est pas l'étape du serveur existant");
    const body = externalServerSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Formulaire invalide', body.error.flatten());
    saveExternalServer(body.data);
    setStep('admin');
    return { ok: true };
  });

  app.post('/server', async (req, reply) => {
    if (chosenMode() !== 'managed') return fail(reply, 409, "L'installation d'un serveur n'a pas été choisie");
    const step = getStep();
    const canEdit = step === 'server' || (step === 'install' && !setupRunner.running && !setupRunner.allDone());
    if (!canEdit) return fail(reply, 409, 'Le serveur ne peut plus être modifié à cette étape');
    const body = palworldSetupSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Formulaire invalide', body.error.flatten());
    savePalworldConfig(body.data);
    store.reset(CONFIG_DEPENDENT_STEPS);
    setStep('install');
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/logs/:id', async (req) => ({ log: store.getLog(req.params.id) }));

  app.post('/install', async (req, reply) => {
    if (getStep() !== 'install') return fail(reply, 409, "Ce n'est pas l'étape d'installation");
    if (setupRunner.running) return fail(reply, 409, 'Installation déjà en cours');
    void setupRunner.runAll().then((ok) => {
      if (ok) setStep('admin');
    });
    return { ok: true };
  });

  app.post('/admin', async (req, reply) => {
    if (getStep() !== 'admin') return fail(reply, 409, "Ce n'est pas l'étape du compte administrateur");
    const body = adminSetupSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Formulaire invalide', body.error.flatten());
    const { username, email, password } = body.data;
    if (usernameTaken(username) || emailTaken(email)) return fail(reply, 409, 'Ce compte existe déjà');
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
    if (!file) return fail(reply, 400, 'Aucun fichier');
    try {
      return { url: await saveImageUpload(file) };
    } catch (e) {
      return fail(reply, 400, (e as Error).message);
    }
  });

  app.post('/site', async (req, reply) => {
    if (getStep() !== 'site') return fail(reply, 409, "Ce n'est pas l'étape du site");
    const body = siteSetupSchema.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'Formulaire invalide', body.error.flatten());
    // On part du menu actuel pour ne pas écraser d'éventuelles entrées déjà ajoutées.
    const menu = [...getSiteSettings().menu];
    if (body.data.discordUrl && !menu.some((m) => m.label === 'Discord')) menu.push({ label: 'Discord', url: body.data.discordUrl });
    saveSiteSettings({ ...getSiteSettings(), ...body.data, menu });
    setStep('finish');
    return { ok: true };
  });

  app.post('/finish', async (req, reply) => {
    if (getStep() !== 'finish') return fail(reply, 409, 'Toutes les étapes ne sont pas terminées');
    modules.installAll();
    seedContent(settings.get<number | null>('setup.adminId', null), getSiteSettings().discordUrl);
    settings.set('setup.done', true);
    removeSetupToken();
    reply.clearCookie(SETUP_COOKIE, cookieOptions());
    startFeatures();
    poller.start();
    return { ok: true };
  });
}
