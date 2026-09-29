/**
 * Libellés français des réglages de PalWorldSettings.ini affichés dans le panel admin.
 * Les clés absentes de cette liste restent éditables dans la section "Avancé".
 */
export interface IniFieldMeta {
  label: string;
  group: IniGroup;
  help?: string;
  options?: string[];
  secret?: boolean;
}

export type IniGroup = 'Serveur' | 'Gameplay' | 'Taux' | 'Joueurs' | 'Pals' | 'Constructions' | 'Guildes';

export const INI_GROUPS: IniGroup[] = ['Serveur', 'Gameplay', 'Taux', 'Joueurs', 'Pals', 'Constructions', 'Guildes'];

/** Réglages que le CMS gère lui-même : affichés en lecture seule. */
export const INI_LOCKED_KEYS = ['RESTAPIEnabled', 'RESTAPIPort'];

export const INI_FIELDS: Record<string, IniFieldMeta> = {
  ServerName: { label: 'Nom du serveur', group: 'Serveur' },
  ServerDescription: { label: 'Description', group: 'Serveur' },
  ServerPassword: { label: 'Mot de passe du serveur', group: 'Serveur', help: 'Vide = serveur ouvert', secret: true },
  AdminPassword: { label: 'Mot de passe admin (en jeu et API)', group: 'Serveur', secret: true },
  ServerPlayerMaxNum: { label: 'Joueurs maximum', group: 'Serveur' },
  PublicPort: { label: 'Port de jeu (UDP)', group: 'Serveur' },
  PublicIP: { label: 'IP publique annoncée', group: 'Serveur', help: 'Laisser vide en général' },
  Region: { label: 'Région', group: 'Serveur' },
  bShowPlayerList: { label: 'Afficher la liste des joueurs en jeu', group: 'Serveur' },
  CrossplayPlatforms: { label: 'Plateformes autorisées', group: 'Serveur', help: 'Ex. (Steam,Xbox,PS5,Mac)' },
  RESTAPIEnabled: { label: 'API REST (gérée par le CMS)', group: 'Serveur' },
  RESTAPIPort: { label: "Port de l'API REST (géré par le CMS)", group: 'Serveur' },
  RCONEnabled: { label: 'RCON activé', group: 'Serveur' },
  RCONPort: { label: 'Port RCON', group: 'Serveur' },
  AutoSaveSpan: { label: 'Sauvegarde auto (secondes)', group: 'Serveur' },

  Difficulty: { label: 'Difficulté', group: 'Gameplay', options: ['None', 'Casual', 'Normal', 'Hard'] },
  DeathPenalty: {
    label: 'Pénalité de mort',
    group: 'Gameplay',
    options: ['None', 'Item', 'ItemAndEquipment', 'All'],
    help: 'None : rien, Item : objets, ItemAndEquipment : objets + équipement, All : tout (Pals compris)',
  },
  bIsPvP: { label: 'PvP', group: 'Gameplay' },
  bEnablePlayerToPlayerDamage: { label: 'Dégâts entre joueurs', group: 'Gameplay' },
  bEnableFriendlyFire: { label: 'Tir allié', group: 'Gameplay' },
  bEnableInvaderEnemy: { label: 'Raids ennemis sur les bases', group: 'Gameplay' },
  bEnableFastTravel: { label: 'Voyage rapide', group: 'Gameplay' },
  bHardcore: { label: 'Mode hardcore', group: 'Gameplay' },
  bPalLost: { label: 'Perte définitive des Pals à la mort', group: 'Gameplay' },
  DayTimeSpeedRate: { label: 'Vitesse du jour', group: 'Gameplay' },
  NightTimeSpeedRate: { label: 'Vitesse de la nuit', group: 'Gameplay' },

  ExpRate: { label: "Taux d'expérience", group: 'Taux' },
  PalCaptureRate: { label: 'Taux de capture', group: 'Taux' },
  PalSpawnNumRate: { label: "Taux d'apparition des Pals", group: 'Taux' },
  CollectionDropRate: { label: 'Taux de récolte', group: 'Taux' },
  EnemyDropItemRate: { label: 'Taux de butin des ennemis', group: 'Taux' },
  WorkSpeedRate: { label: 'Vitesse de travail', group: 'Taux' },
  CollectionObjectRespawnSpeedRate: { label: 'Réapparition des ressources', group: 'Taux' },

  PlayerDamageRateAttack: { label: 'Dégâts infligés (joueur)', group: 'Joueurs' },
  PlayerDamageRateDefense: { label: 'Dégâts reçus (joueur)', group: 'Joueurs' },
  PlayerStomachDecreaceRate: { label: 'Vitesse de la faim (joueur)', group: 'Joueurs' },
  PlayerStaminaDecreaceRate: { label: "Consommation d'endurance (joueur)", group: 'Joueurs' },
  PlayerAutoHPRegeneRate: { label: 'Régénération de vie (joueur)', group: 'Joueurs' },
  ItemWeightRate: { label: 'Poids des objets', group: 'Joueurs' },

  PalDamageRateAttack: { label: 'Dégâts infligés (Pal)', group: 'Pals' },
  PalDamageRateDefense: { label: 'Dégâts reçus (Pal)', group: 'Pals' },
  PalStomachDecreaceRate: { label: 'Vitesse de la faim (Pal)', group: 'Pals' },
  PalStaminaDecreaceRate: { label: "Consommation d'endurance (Pal)", group: 'Pals' },
  PalAutoHPRegeneRate: { label: 'Régénération de vie (Pal)', group: 'Pals' },
  PalEggDefaultHatchingTime: { label: "Temps d'éclosion des œufs (heures)", group: 'Pals' },

  BuildObjectHpRate: { label: 'Résistance des constructions', group: 'Constructions' },
  BuildObjectDamageRate: { label: 'Dégâts aux constructions', group: 'Constructions' },
  BuildObjectDeteriorationDamageRate: { label: 'Détérioration des constructions', group: 'Constructions' },
  BaseCampMaxNum: { label: 'Nombre max de bases (serveur)', group: 'Constructions' },
  BaseCampWorkerMaxNum: { label: 'Pals travailleurs max par base', group: 'Constructions' },
  DropItemMaxNum: { label: "Objets au sol max", group: 'Constructions' },

  GuildPlayerMaxNum: { label: 'Joueurs max par guilde', group: 'Guildes' },
  BaseCampMaxNumInGuild: { label: 'Bases max par guilde', group: 'Guildes' },
  bAutoResetGuildNoOnlinePlayers: { label: 'Réinitialiser les guildes inactives', group: 'Guildes' },
  AutoResetGuildTimeNoOnlinePlayers: { label: "Délai d'inactivité des guildes (heures)", group: 'Guildes' },
};
