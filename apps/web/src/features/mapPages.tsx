import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Map as MapIcon, Users } from 'lucide-react';
import * as ui from '../components/ui';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useMapData } from './components';
import { LiveMap, POI_ICONS, type MapLayers, type MapPlayer } from './map/LiveMap';
import { t } from '../lib/i18n';

const { Badge, Card, Empty, Spinner, Alert } = ui;

// Public map

const LAYER_LABELS: { id: keyof MapLayers; label: string }[] = [
  { id: 'bases', label: '🏰 {label}' },
  { id: 'fastTravel', label: '🔵 {label}' },
  { id: 'bossTowers', label: '🗼 {label}' },
];

const LAYER_NAMES: Record<keyof MapLayers, string> = { bases: 'Guild bases', fastTravel: 'Fast travel', bossTowers: 'Boss towers' };

/** Map layers (bases, fast travel, towers), with the visitor's choice remembered. */
export function useMapLayers() {
  const [all, setAll] = useState<MapLayers | null>(null);
  const [shown, setShown] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('palcms-map-layers') ?? '') as Record<string, boolean>;
    } catch {
      return { bases: true, fastTravel: false, bossTowers: true };
    }
  });
  useEffect(() => {
    api
      .get<MapLayers>('features/world/map')
      .then(setAll)
      .catch(() => setAll(null));
  }, []);
  const toggle = (id: string, v: boolean) => {
    const next = { ...shown, [id]: v };
    setShown(next);
    try {
      localStorage.setItem('palcms-map-layers', JSON.stringify(next));
    } catch {
      // preference not remembered, no harm done
    }
  };
  const layers = useMemo<MapLayers | undefined>(
    () => (all ? Object.fromEntries(LAYER_LABELS.filter((l) => shown[l.id]).map((l) => [l.id, all[l.id] ?? []])) : undefined),
    [all, shown],
  );
  return { all, shown, toggle, layers };
}

export function MapPage() {
  const { data, players, error } = useMapData('public');
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const { all, shown, toggle, layers } = useMapLayers();
  const navigate = useNavigate();
  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Alert kind="info">{error}</Alert>
      </div>
    );
  }
  if (!data) return <Spinner />;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <MapIcon className="h-8 w-8 text-accent" />
        <div>
          <h1 className="text-3xl font-bold">{t('Live map')}</h1>
          <p className="text-sm text-slate-500">{t('Positions of online players, updated every 5 seconds.')}</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
          <LiveMap
            data={data}
            players={players}
            height="min(75vh, 760px)"
            focus={focus}
            layers={layers}
            onBaseClick={(id) => navigate(`/guilds/${id}`)}
          />
        </div>
        <div className="space-y-6">
          {all && (
            <Card title={t('Show')}>
              <div className="space-y-2">
                {LAYER_LABELS.filter((l) => (all[l.id]?.length ?? 0) > 0).map((l) => (
                  <label key={l.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!shown[l.id]} onChange={(e) => toggle(l.id, e.target.checked)} className="accent-[var(--accent)]" />
                    {l.label.replace('{label}', t(LAYER_NAMES[l.id]))}
                  </label>
                ))}
              </div>
            </Card>
          )}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" /> {t('Online')}
              </span>
            }
            actions={<Badge tone="accent">{players.length}</Badge>}
          >
            {players.length === 0 ? (
              <Empty>{t('Nobody on the map.')}</Empty>
            ) : (
              <ul className="space-y-1">
                {players.map((p: MapPlayer) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setFocus({ x: p.x, y: p.y })}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        {p.name}
                      </span>
                      <span className="text-xs text-slate-500">{t('lvl {level}', { level: p.level })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {data.pois.length > 0 && (
            <Card title={t('Places')}>
              <ul className="space-y-1">
                {data.pois.map((poi) => (
                  <li key={poi.id}>
                    <button
                      onClick={() => setFocus({ x: poi.x, y: poi.y })}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span>{POI_ICONS[poi.icon] ?? '📍'}</span>
                      {poi.label}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {!data.public && <Alert kind="warning">{t('Map hidden from the public: only the team sees it.')}</Alert>}
        </div>
      </div>
    </div>
  );
}

/** Map preview on the home page. */
export function MapWidget() {
  const { boot } = useApp();
  const { data, players } = useMapData('public');
  if (!boot.modules.map || !data) return null;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-accent" /> {t('Live map')}
        </span>
      }
      actions={
        <Link to="/map" className="text-sm font-medium text-accent">
          {t('Full screen')}
        </Link>
      }
    >
      <div className="overflow-hidden rounded-lg">
        <LiveMap data={data} players={players} height={340} />
      </div>
    </Card>
  );
}
