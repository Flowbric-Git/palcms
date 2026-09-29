// Noms des Pals, objets et talents, et points fixes de la carte.
// Données issues de palworld-server-tool (Apache-2.0), en anglais uniquement.
import pals from './pals.json';
import items from './items.json';
import passives from './passives.json';
import mapPoints from './map-points.json';

const palsLower = new Map(Object.entries(pals as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
const valid = (v: string | undefined) => (v && v !== 'en_text' && v !== 'en Text' ? v : undefined);

/** "SheepBall" -> "Lamball". Les variantes alpha (BOSS_) et les inconnues gardent un nom lisible. */
export function palName(type: string): string {
  const key = type.toLowerCase();
  return (
    valid(palsLower.get(key)) ??
    valid(palsLower.get(key.replace(/^boss_/, ''))) ??
    type.replace(/^boss_/i, '').replace(/([a-z])([A-Z])/g, '$1 $2')
  );
}

export function itemName(id: string): string {
  return valid((items as Record<string, string>)[id.toLowerCase()]) ?? id;
}

export function passiveName(id: string): string {
  return valid((passives as Record<string, string>)[id]) ?? id.replace(/_/g, ' ');
}

export const MAP_POINTS = mapPoints as { fastTravel: [number, number][]; bossTowers: [number, number][] };
