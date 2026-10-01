/**
 * Coordinate conversions for the map.
 *
 * - World: coordinates returned by the REST API (location_x / location_y), in Unreal units.
 * - Image: normalized position (0 to 1) on the map image, from its calibration
 *   [maxX, maxY, minX, minY] (same convention as palworld-live-map, MIT license).
 * - Game: coordinates shown on the in-game map (formula from palworld-coord, MIT license).
 * - Leaflet: CRS.Simple frame from 0 to MAP_SIZE, "lat" pointing up.
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

/** Coordinates as shown in the game. */
export function worldToGame(x: number, y: number): { x: number; y: number } {
  return { x: Math.round((y - 158000) / 459), y: Math.round((x + 123888) / 459) };
}

export function gameToWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: gy * 459 - 123888, y: gx * 459 + 158000 };
}
