import { z } from 'zod';

/** Text written between quotes in PalWorldSettings.ini: no quote, backslash or line break. */
const iniText = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^"\r\n\\]*$/, 'Quotes, backslashes and line breaks are not allowed');

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(24, '24 characters maximum')
  .regex(/^[A-Za-z0-9_.-]+$/, 'Letters, digits, "_", "." and "-" only');

export const passwordSchema = z.string().min(8, 'At least 8 characters').max(200);

export const emailSchema = z.string().trim().toLowerCase().email('Invalid email').max(200);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color (#RRGGBB)');

const urlOrPath = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v), 'Invalid link (must start with / or http(s)://)');

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//.test(v), 'Invalid link (must start with http:// or https://)');

export const langSchema = z.enum(['en', 'fr']);

// Setup

export const setupTokenSchema = z.object({ token: z.string().trim().min(8).max(200) });

export const palworldSetupSchema = z
  .object({
    serverName: iniText(64).trim().min(1, 'Name is required'),
    description: iniText(200).default(''),
    serverPassword: iniText(64).default(''),
    adminPassword: iniText(64).min(6, 'At least 6 characters'),
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
    message: 'The REST API port must be different from the game port',
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
  url: urlOrPath.refine((v) => v !== '', 'Link is required'),
});

export const siteSettingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160).default(''),
  accentColor: hexColor,
  defaultTheme: z.enum(['dark', 'light', 'system']),
  allowThemeToggle: z.boolean(),
  /** Language of the public site and of the messages sent by the server (Discord, in-game). */
  language: langSchema.default('en'),
  discordUrl: optionalUrl.default(''),
  logoUrl: urlOrPath.default(''),
  bannerUrl: urlOrPath.default(''),
  heroTitle: z.string().trim().max(120).default(''),
  heroText: z.string().trim().max(500).default(''),
  footerText: z.string().trim().max(300).default(''),
  serverAddress: z.string().trim().max(200).default(''),
  /** Link of the "Join the server" button on the home page. */
  joinUrl: urlOrPath.default('/p/join'),
  menu: z.array(menuItemSchema).max(20),
  registration: z.object({ steam: z.boolean(), email: z.boolean() }),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const siteSetupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160).default(''),
  accentColor: hexColor,
  defaultTheme: z.enum(['dark', 'light', 'system']),
  language: langSchema.default('en'),
  discordUrl: optionalUrl.default(''),
  logoUrl: urlOrPath.default(''),
});

// Content

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits and dashes only');

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

// Accounts

export const loginSchema = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  inGameName: z.string().trim().min(1, 'In-game name is required').max(32),
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

// Palworld server: installed by PalCMS or external

export const serverModeSchema = z.object({ mode: z.enum(['managed', 'external', 'none']) });
export type ServerMode = z.infer<typeof serverModeSchema>['mode'];

const hostname = z
  .string()
  .trim()
  .min(1, 'Address is required')
  .max(253)
  .regex(/^[A-Za-z0-9.-]+$|^\[?[0-9a-fA-F:]+\]?$/, 'Invalid address (domain name or IP)');

/** Connection to the REST API of an existing Palworld server (not installed by PalCMS). */
export const externalServerSchema = z.object({
  apiHost: hostname,
  apiPort: z.coerce.number().int().min(1).max(65535),
  adminPassword: z.string().min(1, 'Admin password is required').max(64),
  /** Address players type in game (e.g. play.myserver.com:8211). */
  publicAddress: z.string().trim().max(200).default(''),
  /** Optional RCON port, for the panel console. */
  rconPort: z.coerce.number().int().min(1).max(65535).nullable().default(null),
});
export type ExternalServer = z.infer<typeof externalServerSchema>;

export const connectionTestSchema = externalServerSchema.pick({ apiHost: true, apiPort: true, adminPassword: true });
