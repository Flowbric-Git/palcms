/**
 * Labels of the PalWorldSettings.ini settings shown in the admin panel (translated on display).
 * Keys missing from this list stay editable in the "Advanced" section.
 */
export interface IniFieldMeta {
  label: string;
  group: IniGroup;
  help?: string;
  options?: string[];
  secret?: boolean;
}

export type IniGroup = 'server' | 'gameplay' | 'rates' | 'players' | 'pals' | 'buildings' | 'guilds';

export const INI_GROUPS: IniGroup[] = ['server', 'gameplay', 'rates', 'players', 'pals', 'buildings', 'guilds'];

export const INI_GROUP_LABELS: Record<IniGroup, string> = {
  server: 'Server',
  gameplay: 'Gameplay',
  rates: 'Rates',
  players: 'Players',
  pals: 'Pals',
  buildings: 'Buildings',
  guilds: 'Guilds',
};

/** Settings managed by the CMS itself: shown read-only. */
export const INI_LOCKED_KEYS = ['RESTAPIEnabled', 'RESTAPIPort'];

export const INI_FIELDS: Record<string, IniFieldMeta> = {
  ServerName: { label: 'Server name', group: 'server' },
  ServerDescription: { label: 'Description', group: 'server' },
  ServerPassword: { label: 'Server password', group: 'server', help: 'Empty = open server', secret: true },
  AdminPassword: { label: 'Admin password (in game and API)', group: 'server', secret: true },
  ServerPlayerMaxNum: { label: 'Max players', group: 'server' },
  PublicPort: { label: 'Game port (UDP)', group: 'server' },
  PublicIP: { label: 'Advertised public IP', group: 'server', help: 'Usually left empty' },
  Region: { label: 'Region', group: 'server' },
  bShowPlayerList: { label: 'Show the player list in game', group: 'server' },
  CrossplayPlatforms: { label: 'Allowed platforms', group: 'server', help: 'E.g. (Steam,Xbox,PS5,Mac)' },
  RESTAPIEnabled: { label: 'REST API (managed by the CMS)', group: 'server' },
  RESTAPIPort: { label: 'REST API port (managed by the CMS)', group: 'server' },
  RCONEnabled: { label: 'RCON enabled', group: 'server' },
  RCONPort: { label: 'RCON port', group: 'server' },
  AutoSaveSpan: { label: 'Auto-save (seconds)', group: 'server' },

  Difficulty: { label: 'Difficulty', group: 'gameplay', options: ['None', 'Casual', 'Normal', 'Hard'] },
  DeathPenalty: {
    label: 'Death penalty',
    group: 'gameplay',
    options: ['None', 'Item', 'ItemAndEquipment', 'All'],
    help: 'None: nothing, Item: items, ItemAndEquipment: items + equipment, All: everything (Pals included)',
  },
  bIsPvP: { label: 'PvP', group: 'gameplay' },
  bEnablePlayerToPlayerDamage: { label: 'Player to player damage', group: 'gameplay' },
  bEnableFriendlyFire: { label: 'Friendly fire', group: 'gameplay' },
  bEnableInvaderEnemy: { label: 'Enemy raids on bases', group: 'gameplay' },
  bEnableFastTravel: { label: 'Fast travel', group: 'gameplay' },
  bHardcore: { label: 'Hardcore mode', group: 'gameplay' },
  bPalLost: { label: 'Pals lost for good on death', group: 'gameplay' },
  DayTimeSpeedRate: { label: 'Day speed', group: 'gameplay' },
  NightTimeSpeedRate: { label: 'Night speed', group: 'gameplay' },

  ExpRate: { label: 'Experience rate', group: 'rates' },
  PalCaptureRate: { label: 'Capture rate', group: 'rates' },
  PalSpawnNumRate: { label: 'Pal spawn rate', group: 'rates' },
  CollectionDropRate: { label: 'Gathering rate', group: 'rates' },
  EnemyDropItemRate: { label: 'Enemy loot rate', group: 'rates' },
  WorkSpeedRate: { label: 'Work speed', group: 'rates' },
  CollectionObjectRespawnSpeedRate: { label: 'Resource respawn', group: 'rates' },

  PlayerDamageRateAttack: { label: 'Damage dealt (player)', group: 'players' },
  PlayerDamageRateDefense: { label: 'Damage taken (player)', group: 'players' },
  PlayerStomachDecreaceRate: { label: 'Hunger speed (player)', group: 'players' },
  PlayerStaminaDecreaceRate: { label: 'Stamina use (player)', group: 'players' },
  PlayerAutoHPRegeneRate: { label: 'Health regeneration (player)', group: 'players' },
  ItemWeightRate: { label: 'Item weight', group: 'players' },

  PalDamageRateAttack: { label: 'Damage dealt (Pal)', group: 'pals' },
  PalDamageRateDefense: { label: 'Damage taken (Pal)', group: 'pals' },
  PalStomachDecreaceRate: { label: 'Hunger speed (Pal)', group: 'pals' },
  PalStaminaDecreaceRate: { label: 'Stamina use (Pal)', group: 'pals' },
  PalAutoHPRegeneRate: { label: 'Health regeneration (Pal)', group: 'pals' },
  PalEggDefaultHatchingTime: { label: 'Egg hatching time (hours)', group: 'pals' },

  BuildObjectHpRate: { label: 'Building durability', group: 'buildings' },
  BuildObjectDamageRate: { label: 'Damage to buildings', group: 'buildings' },
  BuildObjectDeteriorationDamageRate: { label: 'Building deterioration', group: 'buildings' },
  BaseCampMaxNum: { label: 'Max bases (server)', group: 'buildings' },
  BaseCampWorkerMaxNum: { label: 'Max working Pals per base', group: 'buildings' },
  DropItemMaxNum: { label: 'Max dropped items', group: 'buildings' },

  GuildPlayerMaxNum: { label: 'Max players per guild', group: 'guilds' },
  BaseCampMaxNumInGuild: { label: 'Max bases per guild', group: 'guilds' },
  bAutoResetGuildNoOnlinePlayers: { label: 'Reset inactive guilds', group: 'guilds' },
  AutoResetGuildTimeNoOnlinePlayers: { label: 'Guild inactivity delay (hours)', group: 'guilds' },
};
