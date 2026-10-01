import { describe, expect, it } from 'vitest';
import {
  buildIniFromSetup,
  decodeValue,
  defaultEntries,
  encodeValue,
  getValue,
  parseOptionSettings,
  serializeOptionSettings,
  setValue,
} from '../src/palworld/iniConfig';

const SAMPLE = `[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,ExpRate=1.500000,ServerName="My, server (EU)",PublicPort=8211,bIsPvP=False,CrossplayPlatforms=(Steam,Xbox,PS5,Mac),ServerPassword="")
`;

describe('parseOptionSettings', () => {
  it('splits correctly, including commas inside quotes and parentheses', () => {
    const entries = parseOptionSettings(SAMPLE);
    expect(entries.map((e) => e.key)).toEqual([
      'Difficulty',
      'ExpRate',
      'ServerName',
      'PublicPort',
      'bIsPvP',
      'CrossplayPlatforms',
      'ServerPassword',
    ]);
    expect(getValue(entries, 'ServerName')).toEqual({ type: 'string', value: 'My, server (EU)' });
    expect(getValue(entries, 'CrossplayPlatforms')).toEqual({ type: 'raw', value: '(Steam,Xbox,PS5,Mac)' });
    expect(getValue(entries, 'ExpRate')).toEqual({ type: 'number', value: 1.5, decimals: true });
    expect(getValue(entries, 'bIsPvP')).toEqual({ type: 'bool', value: false });
  });

  it('round-trips without loss', () => {
    const entries = parseOptionSettings(SAMPLE);
    expect(parseOptionSettings(serializeOptionSettings(entries))).toEqual(entries);
  });

  it('refuses a file without OptionSettings or badly closed', () => {
    expect(() => parseOptionSettings('[x]\nFoo=1')).toThrow();
    expect(() => parseOptionSettings('OptionSettings=(A=1,B=2')).toThrow();
  });

  it('reads the default settings of the dedicated server', () => {
    const entries = defaultEntries();
    expect(entries.length).toBeGreaterThan(60);
    expect(getValue(entries, 'BanListURL')).toEqual({ type: 'string', value: 'https://api.palworldgame.com/api/banlist.txt' });
  });
});

describe('setValue / encodeValue', () => {
  it('keeps the existing type', () => {
    const entries = parseOptionSettings(SAMPLE);
    setValue(entries, 'ExpRate', '2');
    setValue(entries, 'PublicPort', 9000);
    setValue(entries, 'Difficulty', 'Hard');
    setValue(entries, 'bIsPvP', 'true');
    setValue(entries, 'ServerName', 'Nouveau');
    const map = Object.fromEntries(entries.map((e) => [e.key, e.raw]));
    expect(map.ExpRate).toBe('2.000000');
    expect(map.PublicPort).toBe('9000');
    expect(map.Difficulty).toBe('Hard');
    expect(map.bIsPvP).toBe('True');
    expect(map.ServerName).toBe('"Nouveau"');
  });

  it('prevents any injection into the file', () => {
    const entries = parseOptionSettings(SAMPLE);
    setValue(entries, 'ServerName', 'a",AdminPassword="pirate');
    expect(parseOptionSettings(serializeOptionSettings(entries)).filter((e) => e.key === 'AdminPassword')).toHaveLength(0);
    expect(() => setValue(entries, 'Difficulty', 'Hard),AdminPassword=(x')).toThrow();
    expect(() => setValue(entries, 'Bad Key', 1)).toThrow();
    expect(() => encodeValue({ type: 'number', value: Number.NaN, decimals: false })).toThrow();
  });

  it('decodes the values', () => {
    expect(decodeValue('True')).toEqual({ type: 'bool', value: true });
    expect(decodeValue('32')).toEqual({ type: 'number', value: 32, decimals: false });
    expect(decodeValue('All')).toEqual({ type: 'raw', value: 'All' });
  });
});

describe('buildIniFromSetup', () => {
  it('applies the form and forces the REST API', () => {
    const ini = buildIniFromSetup({
      serverName: 'Test',
      description: 'desc',
      serverPassword: '',
      adminPassword: 'secret123',
      maxPlayers: 16,
      port: 8211,
      restApiPort: 8212,
      difficulty: 'Normal',
      expRate: 2,
      palCaptureRate: 1,
      collectionDropRate: 1.5,
      enemyDropItemRate: 1,
      deathPenalty: 'Item',
      pvp: true,
    });
    const entries = parseOptionSettings(ini);
    expect(ini.startsWith('[/Script/Pal.PalGameWorldSettings]')).toBe(true);
    expect(getValue(entries, 'RESTAPIEnabled')).toEqual({ type: 'bool', value: true });
    expect(getValue(entries, 'RESTAPIPort')).toEqual({ type: 'number', value: 8212, decimals: false });
    expect(getValue(entries, 'ServerPlayerMaxNum')).toEqual({ type: 'number', value: 16, decimals: false });
    expect(getValue(entries, 'AdminPassword')).toEqual({ type: 'string', value: 'secret123' });
    expect(getValue(entries, 'DeathPenalty')).toEqual({ type: 'raw', value: 'Item' });
    expect(getValue(entries, 'bIsPvP')).toEqual({ type: 'bool', value: true });
  });
});
