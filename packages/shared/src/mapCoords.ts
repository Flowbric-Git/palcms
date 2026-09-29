/**
 * Conversions de coordonnées pour la carte.
 *
 * - Monde : coordonnées renvoyées par l'API REST (location_x / location_y), en unités Unreal.
 * - Image : position normalisée (0 → 1) sur l'image de la carte, selon sa calibration
 *   [maxX, maxY, minX, minY] (même convention que palworld-live-map, licence MIT).
 * - Jeu : coordonnées affichées sur la carte en jeu (formule de palworld-coord, licence MIT).
 * - Leaflet : repère CRS.Simple de 0 à MAP_SIZE, "lat" vers le haut.
 */
export type Bounds = [number, number, number, number];

export const MAP_SIZE = 1000;

export function worldToImage(x: number, y: number, [maxX, maxY, minX, minY]: Bounds): { u: number; v: number } {
  return { u: (y - minY) / (maxY - minY), v: (maxX - x) / (maxX - minX) };
}

export function imageToWorld(u: number, v: number, [maxX, maxY, minX, minY]: Bounds): { x: number; y: number } {
  return { x: maxX - v * (maxX - minX), y: minY + u * (maxY - minY) };
}

export function worldToLatLng(x: number, y: number, bounds: Bounds): [number, number] {
  const { u, v } = worldToImage(x, y, bounds);
  return [MAP_SIZE * (1 - v), MAP_SIZE * u];
}

export function latLngToWorld(lat: number, lng: number, bounds: Bounds): { x: number; y: number } {
  return imageToWorld(lng / MAP_SIZE, 1 - lat / MAP_SIZE, bounds);
}

/** Coordonnées telles qu'affichées dans le jeu. */
export function worldToGame(x: number, y: number): { x: number; y: number } {
  return { x: Math.round((y - 158000) / 459), y: Math.round((x + 123888) / 459) };
}

export function gameToWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: gy * 459 - 123888, y: gx * 459 + 158000 };
}
