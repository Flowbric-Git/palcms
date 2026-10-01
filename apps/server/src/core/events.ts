import type { HostEventName, HostEvents } from '@palcms/shared';

type Listener<E extends HostEventName> = (data: HostEvents[E]) => void;

/** Internal event bus: the CMS core emits, features (audit log, Discord…) listen. */
class EventBus {
  private listeners = new Map<HostEventName, Set<Listener<never>>>();

  on<E extends HostEventName>(event: E, fn: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as Listener<never>);
    return () => set!.delete(fn as Listener<never>);
  }

  emit<E extends HostEventName>(event: E, data: HostEvents[E]): void {
    for (const fn of this.listeners.get(event) ?? []) {
      try {
        (fn as Listener<E>)(data);
      } catch (e) {
        console.error(`[events] ${event} :`, e);
      }
    }
  }
}

export const events = new EventBus();
