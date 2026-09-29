import type { PalworldSetup } from '@palcms/shared';

/**
 * Lecture / écriture de PalWorldSettings.ini.
 * Le fichier contient une seule ligne utile : OptionSettings=(Cle=Valeur,Cle="texte",Cle=(A,B),...)
 * Les valeurs peuvent contenir des virgules (entre guillemets ou parenthèses) : on tokenise à la main.
 */
export const INI_HEADER = '[/Script/Pal.PalGameWorldSettings]';

export interface IniEntry {
  key: string;
  raw: string;
}

export type IniValue =
  | { type: 'bool'; value: boolean }
  | { type: 'number'; value: number; decimals: boolean }
  | { type: 'string'; value: string }
  | { type: 'raw'; value: string };

/** Réglages par défaut du serveur dédié (DefaultPalWorldSettings.ini). */
export const DEFAULT_OPTIONS =
  'Difficulty=None,RandomizerType=None,RandomizerSeed="",bIsRandomizerPalLevelRandom=False,DayTimeSpeedRate=1.000000,' +
  'NightTimeSpeedRate=1.000000,ExpRate=1.000000,PalCaptureRate=1.000000,PalSpawnNumRate=1.000000,' +
  'PalDamageRateAttack=1.000000,PalDamageRateDefense=1.000000,PlayerDamageRateAttack=1.000000,' +
  'PlayerDamageRateDefense=1.000000,PlayerStomachDecreaceRate=1.000000,PlayerStaminaDecreaceRate=1.000000,' +
  'PlayerAutoHPRegeneRate=1.000000,PlayerAutoHpRegeneRateInSleep=1.000000,PalStomachDecreaceRate=1.000000,' +
  'PalStaminaDecreaceRate=1.000000,PalAutoHPRegeneRate=1.000000,PalAutoHpRegeneRateInSleep=1.000000,' +
  'BuildObjectHpRate=1.000000,BuildObjectDamageRate=1.000000,BuildObjectDeteriorationDamageRate=1.000000,' +
  'CollectionDropRate=1.000000,CollectionObjectHpRate=1.000000,CollectionObjectRespawnSpeedRate=1.000000,' +
  'EnemyDropItemRate=1.000000,DeathPenalty=All,bEnablePlayerToPlayerDamage=False,bEnableFriendlyFire=False,' +
  'bEnableInvaderEnemy=True,bActiveUNKO=False,bEnableAimAssistPad=True,bEnableAimAssistKeyboard=False,' +
  'DropItemMaxNum=3000,DropItemMaxNum_UNKO=100,BaseCampMaxNum=128,BaseCampWorkerMaxNum=15,' +
  'DropItemAliveMaxHours=1.000000,bAutoResetGuildNoOnlinePlayers=False,AutoResetGuildTimeNoOnlinePlayers=72.000000,' +
  'GuildPlayerMaxNum=20,BaseCampMaxNumInGuild=4,PalEggDefaultHatchingTime=72.000000,WorkSpeedRate=1.000000,' +
  'AutoSaveSpan=30.000000,bIsMultiplay=False,bIsPvP=False,bHardcore=False,bPalLost=False,' +
  'bCharacterRecreateInHardcore=False,bCanPickupOtherGuildDeathPenaltyDrop=False,bEnableNonLoginPenalty=True,' +
  'bEnableFastTravel=True,bIsStartLocationSelectByMap=True,bExistPlayerAfterLogout=False,' +
  'bEnableDefenseOtherGuildPlayer=False,bInvisibleOtherGuildBaseCampAreaFX=False,bBuildAreaLimit=False,' +
  'ItemWeightRate=1.000000,CoopPlayerMaxNum=4,ServerPlayerMaxNum=32,ServerName="Default Palworld Server",' +
  'ServerDescription="",AdminPassword="",ServerPassword="",PublicPort=8211,PublicIP="",RCONEnabled=False,' +
  'RCONPort=25575,Region="",bUseAuth=True,BanListURL="https://api.palworldgame.com/api/banlist.txt",' +
  'RESTAPIEnabled=False,RESTAPIPort=8212,bShowPlayerList=False,ChatPostLimitPerMinute=10,' +
  'CrossplayPlatforms=(Steam,Xbox,PS5,Mac),bIsUseBackupSaveData=True,LogFormatType=Text,SupplyDropSpan=180,' +
  'EnablePredatorBossPal=True,MaxBuildingLimitNum=0,ServerReplicatePawnCullDistance=15000.000000';

export function parseOptionSettings(text: string): IniEntry[] {
  const marker = 'OptionSettings=(';
  const start = text.indexOf(marker);
  if (start < 0) throw new Error('OptionSettings introuvable dans le fichier de configuration');

  const entries: IniEntry[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = '';
  const push = () => {
    const s = cur.trim();
    cur = '';
    if (!s) return;
    const eq = s.indexOf('=');
    if (eq <= 0) return;
    entries.push({ key: s.slice(0, eq).trim(), raw: s.slice(eq + 1).trim() });
  };

  for (let i = start + marker.length; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      cur += ch;
      if (ch === '"') inQuote = false;
    } else if (ch === '"') {
      inQuote = true;
      cur += ch;
    } else if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      if (depth === 0) {
        push();
        return entries;
      }
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      push();
    } else {
      cur += ch;
    }
  }
  throw new Error('OptionSettings non terminé (parenthèse manquante)');
}

export function serializeOptionSettings(entries: IniEntry[]): string {
  return `${INI_HEADER}\nOptionSettings=(${entries.map((e) => `${e.key}=${e.raw}`).join(',')})\n`;
}

export function defaultEntries(): IniEntry[] {
  return parseOptionSettings(`OptionSettings=(${DEFAULT_OPTIONS})`);
}

export function decodeValue(raw: string): IniValue {
  if (/^(true|false)$/i.test(raw)) return { type: 'bool', value: raw.toLowerCase() === 'true' };
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { type: 'number', value: Number(raw), decimals: raw.includes('.') };
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return { type: 'string', value: raw.slice(1, -1) };
  return { type: 'raw', value: raw };
}

export function encodeValue(v: IniValue): string {
  switch (v.type) {
    case 'bool':
      return v.value ? 'True' : 'False';
    case 'number':
      if (!Number.isFinite(v.value)) throw new Error('Nombre invalide');
      return v.decimals ? v.value.toFixed(6) : String(Math.trunc(v.value));
    case 'string':
      return `"${v.value.replace(/["\\\r\n]/g, '')}"`;
    case 'raw':
      if (!/^[A-Za-z0-9_(),. -]*$/.test(v.value)) throw new Error(`Valeur non autorisée : ${v.value}`);
      if (!balancedParens(v.value)) throw new Error(`Parenthèses non équilibrées : ${v.value}`);
      return v.value;
  }
}

function balancedParens(s: string): boolean {
  let d = 0;
  for (const c of s) {
    if (c === '(') d++;
    else if (c === ')' && --d < 0) return false;
  }
  return d === 0;
}

/**
 * Modifie (ou ajoute) une clé en conservant le type existant.
 * Une chaîne sur une valeur "raw" (ex. Difficulty=Hard) reste raw, sur une valeur texte reste entre guillemets.
 */
export function setValue(entries: IniEntry[], key: string, value: boolean | number | string): void {
  if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error(`Clé invalide : ${key}`);
  const entry = entries.find((e) => e.key === key);
  const current = entry ? decodeValue(entry.raw) : null;
  let next: IniValue;

  if (typeof value === 'boolean') {
    next = { type: 'bool', value };
  } else if (typeof value === 'number') {
    const decimals = current?.type === 'number' ? current.decimals : !Number.isInteger(value);
    next = { type: 'number', value, decimals };
  } else if (current?.type === 'bool') {
    next = { type: 'bool', value: value.toLowerCase() === 'true' };
  } else if (current?.type === 'number') {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n)) throw new Error(`${key} : nombre attendu`);
    next = { type: 'number', value: n, decimals: current.decimals };
  } else if (current?.type === 'raw') {
    next = { type: 'raw', value };
  } else {
    next = { type: 'string', value };
  }

  const raw = encodeValue(next);
  if (entry) entry.raw = raw;
  else entries.push({ key, raw });
}

export function getValue(entries: IniEntry[], key: string): IniValue | null {
  const e = entries.find((x) => x.key === key);
  return e ? decodeValue(e.raw) : null;
}

/** Construit le fichier complet à partir du formulaire d'installation. */
export function buildIniFromSetup(setup: PalworldSetup, base: IniEntry[] = defaultEntries(), publicIp = ''): string {
  const entries = base.map((e) => ({ ...e }));
  // IP annoncée dans la liste des serveurs communautaires (Xbox, Game Pass PC, PS5).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(publicIp)) setValue(entries, 'PublicIP', publicIp);
  setValue(entries, 'ServerName', setup.serverName);
  setValue(entries, 'ServerDescription', setup.description);
  setValue(entries, 'ServerPassword', setup.serverPassword);
  setValue(entries, 'AdminPassword', setup.adminPassword);
  setValue(entries, 'ServerPlayerMaxNum', setup.maxPlayers);
  setValue(entries, 'PublicPort', setup.port);
  setValue(entries, 'Difficulty', setup.difficulty);
  setValue(entries, 'ExpRate', setup.expRate);
  setValue(entries, 'PalCaptureRate', setup.palCaptureRate);
  setValue(entries, 'CollectionDropRate', setup.collectionDropRate);
  setValue(entries, 'EnemyDropItemRate', setup.enemyDropItemRate);
  setValue(entries, 'DeathPenalty', setup.deathPenalty);
  setValue(entries, 'bIsPvP', setup.pvp);
  setValue(entries, 'bEnablePlayerToPlayerDamage', setup.pvp);
  forceCmsKeys(entries, setup.restApiPort);
  return serializeOptionSettings(entries);
}

/** Réglages indispensables au CMS : l'API REST doit rester active sur le port choisi. */
export function forceCmsKeys(entries: IniEntry[], restApiPort: number): void {
  setValue(entries, 'RESTAPIEnabled', true);
  setValue(entries, 'RESTAPIPort', restApiPort);
}
