/**
 * Whitelist of palctl commands. The same list is enforced as root in scripts/palctl:
 * the CMS cannot ask the system for anything else, even if it is compromised.
 */
const isPort = (v: string) => /^\d{1,5}$/.test(v) && Number(v) >= 1024 && Number(v) <= 65535;
const isPlayers = (v: string) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 32;
const isLines = (v: string) => /^\d{1,4}$/.test(v) && Number(v) >= 1 && Number(v) <= 2000;
const SERVICE_ACTIONS = ['start', 'stop', 'restart', 'status', 'is-active', 'enable'];
export const BACKUP_TAGS = ['manual', 'auto', 'prerestart', 'preupdate', 'prerestore'] as const;
export const BACKUP_NAME_RE = /^palworld-\d{8}-\d{6}-(manual|auto|prerestart|preupdate|prerestore)\.tar\.gz$/;
const isBackup = (v: string) => BACKUP_NAME_RE.test(v);

type Check = (args: string[]) => boolean;

const SPEC: Record<string, Check> = {
  'install-deps': (a) => a.length === 0,
  'install-palworld': (a) => a.length === 0,
  'update-palworld': (a) => a.length === 0,
  'write-service': (a) => a.length === 2 && isPort(a[0]) && isPlayers(a[1]),
  service: (a) => a.length === 1 && SERVICE_ACTIONS.includes(a[0]),
  'firewall-open': (a) => a.length === 1 && isPort(a[0]),
  'write-config': (a) => a.length === 0,
  'read-config': (a) => a.length === 0,
  logs: (a) => a.length === 1 && isLines(a[0]),
  'tail-logs': (a) => a.length === 0,
  'backup-create': (a) => a.length === 1 && (BACKUP_TAGS as readonly string[]).includes(a[0]),
  'backup-list': (a) => a.length === 0,
  'backup-restore': (a) => a.length === 1 && isBackup(a[0]),
  'backup-delete': (a) => a.length === 1 && isBackup(a[0]),
  'backup-download': (a) => a.length === 1 && isBackup(a[0]),
  'savtools-install': (a) => a.length === 0,
  'savtools-status': (a) => a.length === 0,
  'world-export': (a) => a.length === 0,
  'check-update': (a) => a.length === 0,
  'self-update': (a) => a.length === 1 && /^v\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a[0]),
};

export const PALCTL_COMMANDS = Object.keys(SPEC);

/** Returns null when the command is allowed, otherwise an error message. */
export function validatePalctlArgs(args: string[]): string | null {
  const [cmd, ...rest] = args;
  if (!cmd || !(cmd in SPEC)) return `Unknown palctl command: ${cmd ?? '(empty)'}`;
  if (!SPEC[cmd](rest)) return `Invalid arguments for palctl ${cmd}`;
  return null;
}
