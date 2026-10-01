import { describe, expect, it } from 'vitest';
import { gameToWorld, imageToWorld, latLngToWorld, worldToGame, worldToImage, worldToLatLng, type Bounds } from '../src/mapCoords';

const OFFICIAL: Bounds = [349400, 724400, -1099400, -724400];

describe('map coordinates', () => {
  it('puts the calibration corners at the image corners', () => {
    expect(worldToImage(349400, -724400, OFFICIAL)).toEqual({ u: 0, v: 0 }); // haut gauche
    expect(worldToImage(-1099400, 724400, OFFICIAL)).toEqual({ u: 1, v: 1 }); // bas droite
    expect(worldToImage(-375000, 0, OFFICIAL)).toEqual({ u: 0.5, v: 0.5 }); // centre
  });

  it('round-trips world ↔ image ↔ Leaflet', () => {
    const p = { x: -167230, y: 96430 };
    const { u, v } = worldToImage(p.x, p.y, OFFICIAL);
    expect(imageToWorld(u, v, OFFICIAL).x).toBeCloseTo(p.x, 6);
    expect(imageToWorld(u, v, OFFICIAL).y).toBeCloseTo(p.y, 6);
    const [lat, lng] = worldToLatLng(p.x, p.y, OFFICIAL);
    expect(latLngToWorld(lat, lng, OFFICIAL).x).toBeCloseTo(p.x, 6);
    expect(latLngToWorld(lat, lng, OFFICIAL).y).toBeCloseTo(p.y, 6);
  });

  it('gives the in-game coordinates (palworld-coord example)', () => {
    // Anubis : sav_to_map(-167230, 96430) = (-134, -94)
    expect(worldToGame(-167230, 96430)).toEqual({ x: -134, y: -94 });
    const w = gameToWorld(-134, -94);
    expect(worldToGame(w.x, w.y)).toEqual({ x: -134, y: -94 });
  });
});
