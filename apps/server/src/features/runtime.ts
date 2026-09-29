import type { FeatureSet } from '@palcms/shared';
import { setPermissionResolver } from '../core/permissions';
import { createFeatureHost } from './host';
import { createFeatures } from './index';

let instance: FeatureSet | null = null;
let running = false;

/** Instance unique des fonctionnalités (routes et permissions disponibles dès le démarrage). */
export function features(): FeatureSet {
  if (!instance) {
    instance = createFeatures(createFeatureHost());
    setPermissionResolver((user, permission) => instance!.hasPermission(user, permission));
  }
  return instance;
}

/** Démarre les tâches de fond (sauvegardes, programmation, Discord…), une fois l'installation terminée. */
export function startFeatures(): void {
  if (running) return;
  features().start();
  running = true;
}

export function stopFeatures(): void {
  if (!running) return;
  instance?.stop();
  running = false;
}
