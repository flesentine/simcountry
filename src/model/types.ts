export const RESOURCE_KEYS = ["food", "energy", "metals", "goods"] as const;
export type Resource = (typeof RESOURCE_KEYS)[number];
export type ResourceLedger = Record<Resource, number>;

export type Terrain = "plains" | "forest" | "hills" | "mountains" | "desert";
export type RouteMode = "land" | "sea";

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

export interface WorldCell {
  id: string;
  x: number;
  y: number;
  land: boolean;
  coastal: boolean;
  ownerId: string | null;
  terrain: Terrain;
  elevation: number;
  deposits: ResourceLedger;
}

export interface City {
  id: string;
  name: string;
  countryId: string;
  cellId: string;
  x: number;
  y: number;
  population: number;
  capital: boolean;
  port: boolean;
  industry: number;
}

export interface TradeRoute {
  id: string;
  a: string;
  b: string;
  mode: RouteMode;
  fromCityId: string;
  toCityId: string;
  distance: number;
  capacity: number;
  usedThisWeek: number;
}

export interface Geography {
  width: number;
  height: number;
  cells: WorldCell[];
  adjacency: Record<string, string[]>;
  cities: City[];
  routes: TradeRoute[];
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
  geography: Geography;
  wars: War[];
  truces: Truce[];
  events: WorldEvent[];
}
