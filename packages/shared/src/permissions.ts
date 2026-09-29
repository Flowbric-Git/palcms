/**
 * Permissions du panel admin, réparties entre les membres de l'équipe par les rôles
 * (Administrateur, Modérateur, Rédacteur, rôles personnalisés).
 */
export const PERMISSIONS = {
  'server.control': 'Démarrer, arrêter et redémarrer le serveur',
  'server.config': 'Modifier la configuration du serveur',
  'server.players': 'Voir les joueurs',
  'server.logs': 'Voir les logs',
  'server.moderation': 'Expulser, bannir, liste blanche',
  'server.announce': 'Envoyer des annonces en jeu',
  'server.rcon': 'Console RCON',
  'server.backups': 'Sauvegardes et restauration',
  'server.schedules': 'Redémarrages programmés et mises à jour',
  'server.world': 'Données du monde (inventaires, Pals, guildes)',
  'server.events': 'Événements et préréglages',
  'site.pages': 'Pages',
  'site.news': 'Actualités',
  'site.appearance': 'Apparence, menu et thèmes',
  'site.modules': 'Modules',
  'site.members': 'Membres',
  'site.map': 'Carte (image et points d’intérêt)',
  'site.discord': 'Discord',
  'site.tickets': 'Signalements et suggestions',
  'admin.team': 'Équipe et rôles',
  'admin.audit': 'Journal des actions',
  'admin.updates': 'Mises à jour de PalCMS',
  'admin.extensions': 'Plugins, thèmes et market',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { title: string; keys: Permission[] }[] = [
  { title: 'Serveur', keys: ALL_PERMISSIONS.filter((p) => p.startsWith('server.')) },
  { title: 'Site', keys: ALL_PERMISSIONS.filter((p) => p.startsWith('site.')) },
  { title: 'Administration', keys: ALL_PERMISSIONS.filter((p) => p.startsWith('admin.')) },
];
