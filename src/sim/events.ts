import type { EventKind, EventMessage, WorldEvent, WorldState } from "../model/types";

function normalizeNarrative(message: EventMessage) {
  return typeof message === "string" ? { text: message } : message;
}

export function recordWorldEvent(world: WorldState, kind: EventKind, message: EventMessage) {
  const narrative = normalizeNarrative(message);
  const event: WorldEvent = {
    id: world.nextEventId++,
    week: world.week,
    kind,
    text: narrative.text,
    ...(narrative.audienceCountryIds ? { audienceCountryIds: [...narrative.audienceCountryIds] } : {}),
    ...("publicText" in narrative ? { publicText: narrative.publicText ?? null } : {}),
  };
  world.events.unshift(event);
  return event;
}

export function eventTextForObserver(event: WorldEvent, observerId: string) {
  if (!event.audienceCountryIds) return event.text;
  if (event.audienceCountryIds.includes(observerId)) return event.text;
  return event.publicText ?? null;
}

export function visibleWorldEventViews(events: readonly WorldEvent[], observerId: string) {
  return events.flatMap((event) => {
    const text = eventTextForObserver(event, observerId);
    return text === null ? [] : [{ event, text }];
  });
}
