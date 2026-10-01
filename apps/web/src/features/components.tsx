import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import type { Channel } from '@palcms/shared';
import { api } from '../lib/api';
import { useRealtime } from '../lib/ws';
import type { MapData, MapPlayer } from './map/LiveMap';

/** Map: configuration + live player positions (public or team channel). */
export function useMapData(channel: Channel = 'public') {
  const [data, setData] = useState<MapData | null>(null);
  const [players, setPlayers] = useState<MapPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api
      .get<MapData>('features/map')
      .then((d) => {
        setData(d);
        setPlayers(d.players);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [tick]);

  useRealtime(channel, (msg) => {
    if (msg.type === 'feature' && msg.event === 'map') setPlayers(msg.data as MapPlayer[]);
  });

  return { data, players, error, reload: () => setTick((t) => t + 1), setData };
}

/** Minimal bar chart (SVG), with no dependency. */
export function BarChart({
  points,
  format = (v) => String(v),
  height = 140,
}: {
  points: { label: string; value: number }[];
  format?: (v: number) => string;
  height?: number;
}) {
  if (points.length === 0) return <p className="py-8 text-center text-sm text-slate-500">{t('No data yet.')}</p>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const w = 100 / points.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        {points.map((p, i) => {
          const h = (p.value / max) * (height - 4);
          return (
            <rect key={p.label} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx={0.6} className="fill-accent/80">
              <title>{`${p.label}: ${format(p.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{points[0].label}</span>
        <span>max {format(max)}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

/** Minimal line chart (SVG). */
export function LineChart({ points, height = 140 }: { points: { label: string; value: number }[]; height?: number }) {
  if (points.length < 2) return <p className="py-8 text-center text-sm text-slate-500">{t('Not enough data yet.')}</p>;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(min + 1, ...points.map((p) => p.value));
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => height - 6 - ((v - min) / (max - min)) * (height - 12);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        <path d={`${d} L100,${height} L0,${height} Z`} className="fill-accent/15" />
        <path d={d} fill="none" className="stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{points[0].label}</span>
        <span>
          {min} → {points[points.length - 1].value}
        </span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
