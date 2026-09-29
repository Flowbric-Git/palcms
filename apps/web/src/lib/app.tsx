import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Bootstrap, PublicUser } from '@palcms/shared';
import { api } from './api';
import { realtime } from './ws';
import { applyTheme } from './theme';

interface AppState {
  boot: Bootstrap;
  refresh: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
  isAdmin: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp hors du AppProvider');
  return v;
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const b = await api.get<Bootstrap>('public/bootstrap');
      setBoot(b);
      setError(null);
      applyTheme(b.site);
      document.title = b.site.name;
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setUser = useCallback((user: PublicUser | null) => {
    setBoot((b) => (b ? { ...b, user } : b));
    // Les droits du WebSocket dépendent de la session : on se reconnecte.
    realtime.reconnect();
  }, []);

  if (error && !boot) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Impossible de joindre le serveur du site.</p>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <button className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-white" onClick={() => void refresh()}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }
  if (!boot) return <>{fallback}</>;

  const isAdmin = !!boot.user && boot.user.status === 'active' && (boot.user.role === 'admin' || boot.user.role === 'superadmin');
  return <Ctx.Provider value={{ boot, refresh, setUser, isAdmin }}>{children}</Ctx.Provider>;
}
