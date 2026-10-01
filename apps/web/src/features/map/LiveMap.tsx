import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { MAP_SIZE as SIZE, latLngToWorld, worldToGame, worldToLatLng, type Bounds } from '@palcms/shared';
import { t } from '../../lib/i18n';

export interface MapPlayer {
  id: string;
  name: string;
  level: number;
  x: number;
  y: number;
}

export interface MapPoi {
  id: number;
  label: string;
  description: string;
  icon: string;
  color: string;
  x: number;
  y: number;
}

export interface MapData {
  public: boolean;
  settings: { image: 'official' | 'custom' | 'neutral'; customUrl: string; bounds: Bounds };
  officialUrl: string;
  pois: MapPoi[];
  players: MapPlayer[];
}

/** Optional layers: guild bases (world save) and fixed game points. */
export interface MapLayers {
  bases?: { x: number; y: number; guild: string; guildId: string; level: number }[];
  fastTravel?: [number, number][];
  bossTowers?: [number, number][];
}

export const POI_ICONS: Record<string, string> = {
  pin: '📍',
  home: '🏠',
  shop: '🛒',
  sword: '⚔️',
  flag: '🚩',
  star: '⭐',
  skull: '💀',
  tent: '⛺',
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Leaflet map (CRS.Simple): map image, points of interest and live players.
 * When the image is missing or fails to load, a neutral grid map is shown.
 */
export function LiveMap({
  data,
  players,
  height = 560,
  onMapClick,
  onPoiClick,
  focus,
  layers,
  onBaseClick,
}: {
  data: MapData;
  players: MapPlayer[];
  height?: number | string;
  onMapClick?: (world: { x: number; y: number }) => void;
  onPoiClick?: (poi: MapPoi) => void;
  focus?: { x: number; y: number } | null;
  layers?: MapLayers;
  onBaseClick?: (guildId: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const playerLayer = useRef<L.LayerGroup | null>(null);
  const poiLayer = useRef<L.LayerGroup | null>(null);
  const extraLayer = useRef<L.LayerGroup | null>(null);
  const baseClickRef = useRef(onBaseClick);
  baseClickRef.current = onBaseClick;
  const markers = useRef(new Map<string, L.Marker>());
  const [neutral, setNeutral] = useState(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const bounds = data.settings.bounds;

  const imageUrl =
    data.settings.image === 'neutral' ? null : data.settings.image === 'custom' && data.settings.customUrl ? data.settings.customUrl : data.officialUrl;

  // Creates the map and its background image.
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, {
      crs: L.CRS.Simple,
      minZoom: -1,
      maxZoom: 4,
      zoomSnap: 0.25,
      attributionControl: true,
      maxBounds: [
        [-SIZE * 0.25, -SIZE * 0.25],
        [SIZE * 1.25, SIZE * 1.25],
      ],
    });
    const extent: L.LatLngBoundsExpression = [
      [0, 0],
      [SIZE, SIZE],
    ];
    m.fitBounds(extent);
    setNeutral(!imageUrl);
    if (imageUrl) {
      const overlay = L.imageOverlay(imageUrl, extent, { attribution: t('Map © Pocketpair, Inc.') }).addTo(m);
      overlay.on('error', () => {
        m.removeLayer(overlay);
        setNeutral(true);
      });
    }
    extraLayer.current = L.layerGroup().addTo(m);
    poiLayer.current = L.layerGroup().addTo(m);
    playerLayer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => clickRef.current?.(latLngToWorld(e.latlng.lat, e.latlng.lng, bounds)));
    map.current = m;
    const current = markers.current;
    return () => {
      m.remove();
      map.current = null;
      current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, bounds.join(',')]);

  // Points of interest.
  useEffect(() => {
    const layer = poiLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const poi of data.pois) {
      const marker = L.marker(worldToLatLng(poi.x, poi.y, bounds), {
        icon: L.divIcon({
          className: '',
          html: `<div class="palcms-marker" style="width:30px;height:30px;background:${escape(poi.color)};font-size:15px">${POI_ICONS[poi.icon] ?? '📍'}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      })
        .bindTooltip(escape(poi.label), { className: 'palcms-label', direction: 'top', offset: [0, -14] })
        .addTo(layer);
      if (poi.description) marker.bindPopup(`<strong>${escape(poi.label)}</strong><br>${escape(poi.description)}`);
      if (onPoiClick) marker.on('click', () => onPoiClick(poi));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.pois, imageUrl, bounds.join(',')]);

  // Optional layers (bases, fast travel, towers).
  useEffect(() => {
    const layer = extraLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const [x, y] of layers?.fastTravel ?? []) {
      L.circleMarker(worldToLatLng(x, y, bounds), { radius: 4, color: '#38bdf8', weight: 2, fillColor: '#0ea5e9', fillOpacity: 0.8 })
        .bindTooltip(t('Fast travel'), { className: 'palcms-label', direction: 'top' })
        .addTo(layer);
    }
    for (const [x, y] of layers?.bossTowers ?? []) {
      L.marker(worldToLatLng(x, y, bounds), {
        icon: L.divIcon({ className: '', html: '<div class="palcms-marker" style="width:28px;height:28px;background:#7c3aed;font-size:14px">🗼</div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
      })
        .bindTooltip(t('Boss tower'), { className: 'palcms-label', direction: 'top', offset: [0, -12] })
        .addTo(layer);
    }
    for (const b of layers?.bases ?? []) {
      const marker = L.marker(worldToLatLng(b.x, b.y, bounds), {
        icon: L.divIcon({ className: '', html: '<div class="palcms-marker" style="width:30px;height:30px;background:#b45309;font-size:15px">🏰</div>', iconSize: [30, 30], iconAnchor: [15, 15] }),
      })
        .bindTooltip(`${escape(b.guild)} · ${t('lvl {level}', { level: b.level })}`, { className: 'palcms-label', direction: 'top', offset: [0, -14] })
        .addTo(layer);
      marker.on('click', () => baseClickRef.current?.(b.guildId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, imageUrl, bounds.join(',')]);

  // Players: existing markers are moved, not recreated (smooth animation).
  useEffect(() => {
    const layer = playerLayer.current;
    if (!layer) return;
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      const pos = worldToLatLng(p.x, p.y, bounds);
      const g = worldToGame(p.x, p.y);
      const tip = `${escape(p.name)} · ${t('lvl {level}', { level: p.level })} <span style="opacity:.7">(${g.x}, ${g.y})</span>`;
      const existing = markers.current.get(p.id);
      if (existing) {
        existing.setLatLng(pos);
        existing.setTooltipContent(tip);
      } else {
        const m = L.marker(pos, {
          icon: L.divIcon({
            className: '',
            html: `<div class="palcms-marker player" style="width:26px;height:26px">${p.level}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
          zIndexOffset: 1000,
        })
          .bindTooltip(tip, { className: 'palcms-label', direction: 'top', offset: [0, -12], permanent: true })
          .addTo(layer);
        markers.current.set(p.id, m);
      }
    }
    for (const [id, m] of markers.current) {
      if (!seen.has(id)) {
        layer.removeLayer(m);
        markers.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, imageUrl, bounds.join(',')]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo(worldToLatLng(focus.x, focus.y, bounds), 2, { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div
      ref={el}
      className="palcms-map w-full"
      style={{
        height,
        cursor: onMapClick ? 'crosshair' : undefined,
        backgroundImage: neutral
          ? 'linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)'
          : undefined,
        backgroundSize: neutral ? '40px 40px' : undefined,
      }}
    />
  );
}
