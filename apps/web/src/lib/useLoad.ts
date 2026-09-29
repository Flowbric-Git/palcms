import { useEffect, useState } from 'react';
import { api } from './api';

/** Charge une ressource de l'API avec rechargement manuel. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api
      .get<T>(path)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [path, tick]);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}
