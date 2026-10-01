// Official list of Pals (Palworld 1.0), sorted by Paldex number.
// Source: game files, through AlbertoJALJ/Palworld (data/pals.json). English names.
import list from './paldex.json';

export type PalElement = 'neutral' | 'grass' | 'water' | 'fire' | 'electric' | 'dark' | 'ground' | 'ice' | 'dragon';

export interface PaldexSpecies {
  /** Lowercase game id ("sheepball"), also the image name public/pals/<id>.png */
  id: string;
  /** Number shown in the game ("001", "005B") */
  no: string;
  name: string;
  elements: PalElement[];
}

export const PALDEX = list as PaldexSpecies[];

/** "BOSS_SheepBall" / "SheepBall" -> "sheepball" (alphas count as their species). */
export const paldexId = (type: string) => type.replace(/^boss_/i, '').toLowerCase();
