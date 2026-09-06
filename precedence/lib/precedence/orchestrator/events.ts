/**
 * Event bus and subscription for priority settlement lifecycle events.
 */
import type { EventLevel, LifecycleEvent, LifecyclePhase, RaceId } from "../types";
import { appendEvent, getEventsSince } from "../store/repositories";

export type EventSubscriber = (ev: LifecycleEvent) => void;

class EventBus {
  private subscribers = new Map<RaceId, Set<EventSubscriber>>();
  private seqByRace = new Map<RaceId, number>();

  subscribe(raceId: RaceId, fn: EventSubscriber): () => void {
    let set = this.subscribers.get(raceId);
    if (!set) {
      set = new Set();
      this.subscribers.set(raceId, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set && set.size === 0) this.subscribers.delete(raceId);
    };
  }

  async emit(raceId: RaceId, phase: LifecyclePhase, level: EventLevel, message: string, data?: unknown): Promise<LifecycleEvent> {
    const seq = (this.seqByRace.get(raceId) ?? 0) + 1;
    this.seqByRace.set(raceId, seq);

    const event: LifecycleEvent = {
      id: `${raceId}-evt-${seq}`,
      raceId,
      phase,
      level,
      message,
      data,
      at: new Date().toISOString(),
      seq,
    };

    await appendEvent(event);
    const set = this.subscribers.get(raceId);
    if (set) {
      for (const fn of set) {
        try {
          fn(event);
        } catch {
          // ignore subscriber error
        }
      }
    }
    return event;
  }
}

const g = globalThis as unknown as { __precedenceEventBus?: EventBus };
export const eventBus = (g.__precedenceEventBus ??= new EventBus());

export function subscribeEvents(raceId: RaceId, fn: EventSubscriber): () => void {
  return eventBus.subscribe(raceId, fn);
}

export function emitEvent(raceId: RaceId, phase: LifecyclePhase, level: EventLevel, message: string, data?: unknown): Promise<LifecycleEvent> {
  return eventBus.emit(raceId, phase, level, message, data);
}
