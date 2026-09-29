import { z } from 'zod';

/** Texte qui sera écrit entre guillemets dans PalWorldSettings.ini : pas de guillemet ni de retour à la ligne. */
const iniText = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^"\r\n\\]*$/, 'Les guillemets, antislash et retours à la ligne sont interdits');

export const usernameSchema = z
  .string()
  .trim()
  .min(3, '3 caractères minimum')
  .max(24, '24 caractères maximum')
  .regex(/^[A-Za-z0-9_.-]+$/, 'Lettres, chiffres, « _ », « . » et « - » uniquement');

export const passwordSchema = z.string().min(8, '8 caractères minimum').max(200);

export const emailSchema = z.string().trim().toLowerCase().email('Email invalide').max(200);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (#RRGGBB)');

const urlOrPath = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v), 'Lien invalide (doit commencer par / ou http(s)://)');

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//.test(v), 'Lien invalide (doit commencer par http:// ou https://)');

// Setup

export const setupTokenSchema = z.object({ token: z.string().trim().min(8).max(200) });

export const palworldSetupSchema = z
  .object({
    serverName: iniText(64).trim().min(1, 'Nom obligatoire'),
    description: iniText(200).default(''),
    serverPassword: iniText(64).default(''),
    adminPassword: iniText(64).min(6, '6 caractères minimum'),
    maxPlayers: z.coerce.number().int().min(1).max(32),
    port: z.coerce.number().int().min(1024).max(65535),
    restApiPort: z.coerce.number().int().min(1024).max(65535),
    difficulty: z.enum(['None', 'Casual', 'Normal', 'Hard']),
    expRate: z.coerce.number().min(0.1).max(20),
    palCaptureRate: z.coerce.number().min(0.5).max(2),
    collectionDropRate: z.coerce.number().min(0.5).max(3),
    enemyDropItemRate: z.coerce.number().min(0.5).max(3),
    deathPenalty: z.enum(['None', 'Item', 'ItemAndEquipment', 'All']),
    pvp: z.boolean(),
  })
  .refine((d) => d.port !== d.restApiPort, {
    message: "Le port de l'API REST doit être différent du port de jeu",
    path: ['restApiPort'],
  });
export type PalworldSetup = z.infer<typeof palworldSetupSchema>;

export const adminSetupSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const menuItemSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: urlOrPath.refine((v) => v !== '', 'Lien obligatoire'),
});

export const siteSettingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160).default(''),
  accentColor: hexColor,
  defaultTheme: z.enum(['dark', 'light', 'system']),
  allowThemeToggle: z.boolean(),
  discordUrl: optionalUrl.default(''),
  logoUrl: urlOrPath.default(''),
  bannerUrl: urlOrPath.default(''),
  heroTitle: z.string().trim().max(120).default(''),
  heroText: z.string().trim().max(500).default(''),
  footerText: z.string().trim().max(300).default(''),
  serverAddress: z.string().trim().max(200).default(''),
  menu: z.array(menuItemSchema).max(20),
  registration: z.object({ steam: z.boolean(), email: z.boolean() }),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const siteSetupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160).default(''),
  accentColor: hexColor,
  defaultTheme: z.enum(['dark', 'light', 'system']),
  discordUrl: optionalUrl.default(''),
  logoUrl: urlOrPath.default(''),
});

// Contenu

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Minuscules, chiffres et tirets uniquement');

export const pageSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(120),
  contentHtml: z.string().max(200_000),
  published: z.boolean(),
});

export const newsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema.optional(),
  excerpt: z.string().trim().max(400).default(''),
  contentHtml: z.string().max(200_000),
  coverUrl: urlOrPath.default(''),
  published: z.boolean(),
});

// Comptes

export const loginSchema = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  inGameName: z.string().trim().min(1, 'Pseudo en jeu obligatoire').max(32),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(32).optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema.optional(),
});


export const memberDecisionSchema = z.object({
  playerUid: z.string().max(100).nullable().optional(),
});

export const serverConfigUpdateSchema = z.object({
  values: z.record(z.union([z.string().max(500), z.number(), z.boolean()])),
  restart: z.boolean().default(false),
});

// Serveur Palworld : installé ou externe

export const serverModeSchema = z.object({ mode: z.enum(['managed', 'external', 'none']) });
export type ServerMode = z.infer<typeof serverModeSchema>['mode'];

const hostname = z
  .string()
  .trim()
  .min(1, 'Adresse obligatoire')
  .max(253)
  .regex(/^[A-Za-z0-9.-]+$|^\[?[0-9a-fA-F:]+\]?$/, 'Adresse invalide (nom de domaine ou IP)');

/** Connexion à l'API REST d'un serveur Palworld existant (non installé par PalCMS). */
export const externalServerSchema = z.object({
  apiHost: hostname,
  apiPort: z.coerce.number().int().min(1).max(65535),
  adminPassword: z.string().min(1, 'Mot de passe admin obligatoire').max(64),
  /** Adresse que les joueurs saisissent en jeu (ex. play.monserveur.fr:8211). */
  publicAddress: z.string().trim().max(200).default(''),
  /** Port RCON (facultatif) pour la console du panel. */
  rconPort: z.coerce.number().int().min(1).max(65535).nullable().default(null),
});
export type ExternalServer = z.infer<typeof externalServerSchema>;

export const connectionTestSchema = externalServerSchema.pick({ apiHost: true, apiPort: true, adminPassword: true });
