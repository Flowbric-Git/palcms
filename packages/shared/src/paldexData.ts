// Liste officielle des Pals (Palworld 1.0) triée par numéro de Paldex.
// Source : fichiers du jeu, via AlbertoJALJ/Palworld (data/pals.json). Noms en anglais.
import list from './paldex.json';

export type PalElement = 'neutral' | 'grass' | 'water' | 'fire' | 'electric' | 'dark' | 'ground' | 'ice' | 'dragon';

export interface PaldexSpecies {
  /** Identifiant du jeu en minuscules ("sheepball"), aussi nom de l'image public/pals/<id>.png */
  id: string;
  /** Numéro affiché dans le jeu ("001", "005B") */
  no: string;
  name: string;
  elements: PalElement[];
}

export const PALDEX = list as PaldexSpecies[];

/** "BOSS_SheepBall" / "SheepBall" -> "sheepball" (les alphas comptent pour leur espèce). */
export const paldexId = (type: string) => type.replace(/^boss_/i, '').toLowerCase();
