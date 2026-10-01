import type { HostMigration, HostModuleDef, Permission } from '@palcms/shared';

const MODERATOR: Permission[] = ['server.players', 'server.logs', 'server.moderation', 'server.announce', 'site.members'];
const EDITOR: Permission[] = ['site.pages', 'site.news'];

export const MIGRATIONS: HostMigration[] = [
  {
    id: 'core:002-features',
    sql: `
      ALTER TABLE users ADD COLUMN admin_role_id INTEGER;

      CREATE TABLE pro_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        permissions TEXT NOT NULL,
        builtin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      INSERT INTO pro_roles (name, permissions, builtin, created_at) VALUES
        ('Administrateur', '["*"]', 1, 0),
        ('Modérateur', '${JSON.stringify(MODERATOR)}', 1, 0),
        ('Rédacteur', '${JSON.stringify(EDITOR)}', 1, 0);

      CREATE TABLE pro_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT
      );
      CREATE INDEX idx_pro_audit_ts ON pro_audit(ts);

      CREATE TABLE pro_player_daily (
        uid TEXT NOT NULL,
        day TEXT NOT NULL,
        level INTEGER NOT NULL,
        playtime_seconds INTEGER NOT NULL,
        PRIMARY KEY (uid, day)
      );

      CREATE TABLE pro_map_poi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'pin',
        color TEXT NOT NULL DEFAULT '#f59e0b',
        x REAL NOT NULL,
        y REAL NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE pro_whitelist (
        uid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        added_by TEXT
      );

      CREATE TABLE pro_bans (
        uid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        banned_at INTEGER NOT NULL,
        banned_by TEXT
      );

      CREATE TABLE pro_announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        run_at INTEGER NOT NULL,
        repeat TEXT NOT NULL DEFAULT 'none',
        last_sent_at INTEGER,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );
    `,
  },
  {
    id: 'core:003-world',
    sql: `
      -- World data read from the save files (sav_cli). Replaced on every read.
      CREATE TABLE world_players (
        player_uid TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        level INTEGER NOT NULL,
        exp INTEGER NOT NULL DEFAULT 0,
        hp INTEGER NOT NULL DEFAULT 0,
        full_stomach REAL NOT NULL DEFAULT 0,
        status_points TEXT NOT NULL DEFAULT '{}',
        items TEXT NOT NULL DEFAULT '{}',
        pal_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE world_pals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_uid TEXT NOT NULL,
        type TEXT NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        level INTEGER NOT NULL,
        gender TEXT NOT NULL DEFAULT '',
        is_lucky INTEGER NOT NULL DEFAULT 0,
        is_boss INTEGER NOT NULL DEFAULT 0,
        rank INTEGER NOT NULL DEFAULT 1,
        talent_hp INTEGER NOT NULL DEFAULT 0,
        talent_shot INTEGER NOT NULL DEFAULT 0,
        talent_defense INTEGER NOT NULL DEFAULT 0,
        skills TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX idx_world_pals_owner ON world_pals(owner_uid);
      CREATE INDEX idx_world_pals_type ON world_pals(type);
      CREATE TABLE world_guilds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 0,
        admin_uid TEXT
      );
      CREATE TABLE world_guild_members (
        guild_id TEXT NOT NULL,
        player_uid TEXT NOT NULL,
        nickname TEXT NOT NULL,
        last_online TEXT
      );
      CREATE INDEX idx_world_guild_members ON world_guild_members(guild_id);
      CREATE TABLE world_bases (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        area REAL NOT NULL DEFAULT 0
      );
      -- Correspondance joueur PalCMS (uid REST) <-> personnage de la sauvegarde
      CREATE TABLE world_links (uid TEXT PRIMARY KEY, player_uid TEXT NOT NULL);

      -- Surveillance
      CREATE TABLE pro_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        level TEXT NOT NULL,
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        resolved_at INTEGER
      );
      CREATE INDEX idx_pro_alerts_ts ON pro_alerts(ts);
      CREATE TABLE pro_uptime (
        day TEXT PRIMARY KEY,
        online_minutes INTEGER NOT NULL DEFAULT 0,
        total_minutes INTEGER NOT NULL DEFAULT 0
      );

      -- Events and presets
      CREATE TABLE pro_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        vals TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE pro_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        starts_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        vals TEXT NOT NULL DEFAULT '{}',
        restart INTEGER NOT NULL DEFAULT 1,
        is_public INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'scheduled',
        saved_vals TEXT,
        error TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_pro_events_starts ON pro_events(starts_at);

      -- Sanctions et anti-triche
      ALTER TABLE pro_bans ADD COLUMN expires_at INTEGER;
      CREATE TABLE pro_sanctions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        created_by TEXT
      );
      CREATE INDEX idx_pro_sanctions_uid ON pro_sanctions(uid);
      CREATE TABLE pro_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        severity INTEGER NOT NULL,
        details TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER,
        resolved_by TEXT,
        resolution TEXT
      );

      -- Signalements et suggestions
      CREATE TABLE pro_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        target TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        reply TEXT,
        replied_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Moderators also handle reports and look at world data
      UPDATE pro_roles SET permissions = '${JSON.stringify([...MODERATOR, 'server.world', 'site.tickets'])}'
        WHERE builtin = 1 AND name = 'Modérateur';
    `,
  },
  {
    // Built-in roles get English names (translated on display).
    id: 'core:005-role-names',
    sql: `
      UPDATE pro_roles SET name = 'Administrator' WHERE builtin = 1 AND name = 'Administrateur';
      UPDATE pro_roles SET name = 'Moderator' WHERE builtin = 1 AND name = 'Modérateur';
      UPDATE pro_roles SET name = 'Editor' WHERE builtin = 1 AND name = 'Rédacteur';
    `,
  },
];

export const MODULES: HostModuleDef[] = [
  {
    id: 'guilds',
    name: 'Guilds',
    description: 'Public guild pages: members, level and bases on the map (read from the save files).',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'paldex',
    name: 'Server Paldex',
    description: 'All 288 Pals by server, player and guild, with the top collectors (read from the save files).',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'character',
    name: 'My character',
    description: 'Registered players see their Pals, inventory and guild.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'calendar',
    name: 'Events calendar',
    description: 'Upcoming events on the site, with a countdown on the home page.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'uptime',
    name: 'Uptime page',
    description: 'Server uptime over 30 days, attendance and next restart.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'tickets',
    name: 'Reports and suggestions',
    description: 'Registered players report a problem or suggest an idea to the team.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'world',
    name: 'World data',
    description: 'Reads the save files: inventories, Pals, guilds and bases.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Alerts, connection status, crash detection and attendance statistics.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'events',
    name: 'Events and presets',
    description: 'Scheduled temporary settings (XP x3 weekend…) and configuration presets.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'map',
    name: 'Live map (public)',
    description: 'Map with player positions. Turned off: only admins see it.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'player-stats',
    name: 'Player statistics',
    description: 'Progress charts (level, playtime) on profiles.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'backups',
    name: 'Backups',
    description: 'Automatic backups and restore.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'schedules',
    name: 'Schedules',
    description: 'Scheduled restarts, updates and announcements.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'moderation',
    name: 'Moderation',
    description: 'Kicks, bans and whitelist.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'rcon',
    name: 'RCON console',
    description: 'Server admin commands from the panel.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Notifications in a Discord channel (webhook).',
    area: 'site',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'themes',
    name: 'Advanced themes',
    description: 'Font, background and custom CSS of the public site.',
    area: 'site',
    toggleable: false,
    defaultEnabled: true,
  },
];
