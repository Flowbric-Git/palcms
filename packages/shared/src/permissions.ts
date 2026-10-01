/**
 * Admin panel permissions, shared between team members through roles
 * (Administrator, Moderator, Editor, custom roles). Labels are translated on display.
 */
export const PERMISSIONS = {
  'server.control': 'Start, stop and restart the server',
  'server.config': 'Edit the server configuration',
  'server.players': 'See players',
  'server.logs': 'See logs',
  'server.moderation': 'Kick, ban, whitelist',
  'server.announce': 'Send in-game announcements',
  'server.rcon': 'RCON console',
  'server.backups': 'Backups and restore',
  'server.schedules': 'Scheduled restarts and updates',
  'server.world': 'World data (inventories, Pals, guilds)',
  'server.events': 'Events and presets',
  'site.pages': 'Pages',
  'site.news': 'News',
  'site.appearance': 'Appearance, menu and themes',
  'site.modules': 'Modules',
  'site.members': 'Members',
  'site.map': 'Map (image and points of interest)',
  'site.discord': 'Discord',
  'site.tickets': 'Reports and suggestions',
  'admin.team': 'Team and roles',
  'admin.audit': 'Audit log',
  'admin.updates': 'PalCMS updates',
  'admin.extensions': 'Plugins, themes and market',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { title: string; keys: Permission[] }[] = [
  { title: 'Server', keys: ALL_PERMISSIONS.filter((p) => p.startsWith('server.')) },
  { title: 'Website', keys: ALL_PERMISSIONS.filter((p) => p.startsWith('site.')) },
  { title: 'Administration', keys: ALL_PERMISSIONS.filter((p) => p.startsWith('admin.')) },
];
