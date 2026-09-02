export const RESOURCE_KEYS = ["food", "energy", "metals", "goods"] as const;
export type Resource = (typeof RESOURCE_KEYS)[number];
export type ResourceLedger = Record<Resource, number>;

export interface Relation {
  trust: number;
  tension: number;
  tradeVolume: number;
}

export interface PolicyProfile {
  risk: number;
  expansionism: number;
  commerce: number;
  diplomacy: number;
}

export interface Country {
  id: string;
  name: string;
  color: string;
  population: number;
  treasury: number;
  resources: ResourceLedger;
  production: ResourceLedger;
  needs: ResourceLedger;
  military: number;
  militaryCapacity: number;
  readiness: number;
  stability: number;
  policy: PolicyProfile;
  relations: Record<string, Relation>;
}

export interface War {
  id: string;
  a: string;
  b: string;
  attacker: string;
  startWeek: number;
  casualtiesA: number;
  casualtiesB: number;
}

export interface Truce {
  id: string;
  a: string;
  b: string;
  startWeek: number;
  endWeek: number;
}

export type EventKind = "trade" | "war" | "peace" | "economy" | "politics" | "world";

export interface WorldEvent {
  id: number;
  week: number;
  kind: EventKind;
  text: string;
}

export interface WorldState {
  seed: number;
  week: number;
  nextEventId: number;
  countries: Country[];
  wars: War[];
  truces: Truce[];
  events: WorldEvent[];
}
