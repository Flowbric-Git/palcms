import type { FeatureSet } from '@palcms/shared';
import { setPermissionResolver } from '../core/permissions';
import { createFeatureHost } from './host';
import { createFeatures } from './index';

let instance: FeatureSet | null = null;
let running = false;

/** Single features instance (routes and permissions available right from startup). */
export function features(): FeatureSet {
  if (!instance) {
    instance = createFeatures(createFeatureHost());
    setPermissionResolver((user, permission) => instance!.hasPermission(user, permission));
  }
  return instance;
}

/** Starts background tasks (backups, schedules, Discord…) once setup is finished. */
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
