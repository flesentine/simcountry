export const RESOURCE_KEYS = ["food", "energy", "metals", "goods"] as const;
export type Resource = (typeof RESOURCE_KEYS)[number];
export type ResourceLedger = Record<Resource, number>;

export type Terrain = "plains" | "forest" | "hills" | "mountains" | "desert";
export type RouteMode = "land" | "sea";
export type InfrastructureKind = "road" | "rail" | "shipping_lane";

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

export type GovernmentSystem = "parliamentary_republic" | "presidential_republic" | "constitutional_monarchy" | "one_party_state" | "military_directorate";
export type MinistryKind = "finance" | "trade" | "foreign" | "defense" | "interior";
export type PolicyDomain = "economy" | "trade" | "diplomacy" | "defense" | "stability";
export type InstitutionalPosition = Record<PolicyDomain, number>;

export interface LeaderTraits {
  riskTolerance: number;
  nationalism: number;
  pragmatism: number;
  corruption: number;
  ambition: number;
}

export interface Leader {
  name: string;
  title: string;
  competence: number;
  authority: number;
  traits: LeaderTraits;
  position: InstitutionalPosition;
}

export interface Ministry {
  kind: MinistryKind;
  name: string;
  minister: string;
  competence: number;
  influence: number;
  loyalty: number;
  position: InstitutionalPosition;
}

export interface GovernmentAgenda {
  taxEffort: number;
  civilSpending: number;
  tradeOpenness: number;
  diplomaticEngagement: number;
  defensePosture: number;
  infrastructure: number;
  internalSecurity: number;
}

export type ObjectiveKind = "fiscal" | "trade" | "diplomacy" | "defense" | "infrastructure" | "stability";
export interface GovernmentObjective {
  id: string;
  kind: ObjectiveKind;
  label: string;
  assignedTo: MinistryKind;
  priority: number;
  progress: number;
  status: "active" | "achieved";
}

export interface Government {
  system: GovernmentSystem;
  leader: Leader;
  ministries: Record<MinistryKind, Ministry>;
  agenda: GovernmentAgenda;
  legitimacy: number;
  cohesion: number;
  dissent: number;
  lastDecisionWeek: number;
  objectives: GovernmentObjective[];
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
  government: Government;
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
  baseCapacity: number;
  capacity: number;
  usedThisWeek: number;
  infrastructure: InfrastructureKind;
  level: number;
  condition: number;
  chokepoint: boolean;
  blockedBy: string | null;
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
  frontCellId: string | null;
  supplyA: number;
  supplyB: number;
  momentum: number;
  capturedA: number;
  capturedB: number;
  lastCaptureWeek: number;
  blockadeRouteIds: string[];
}

export interface Truce {
  id: string;
  a: string;
  b: string;
  startWeek: number;
  endWeek: number;
}

export type TreatyStatus = "pending" | "active" | "fulfilled" | "violated" | "expired" | "withdrawn";
export type TreatyClauseStatus = "pending" | "active" | "fulfilled" | "violated" | "expired" | "withdrawn";
export type TreatyClauseClass = "permission" | "obligation" | "restriction";
export type TreatyClauseKind = "preferential_trade" | "tariff" | "quota" | "non_aggression" | "sanction" | "loan" | "reparations";

interface TreatyClauseBase {
  id: string;
  class: TreatyClauseClass;
  kind: TreatyClauseKind;
  status: TreatyClauseStatus;
  scope: string;
}

export interface PreferentialTradeClause extends TreatyClauseBase {
  class: "permission";
  kind: "preferential_trade";
  grantorId: string;
  beneficiaryId: string;
  discountPct: number;
  resource: Resource | null;
}

export interface TariffClause extends TreatyClauseBase {
  class: "restriction";
  kind: "tariff";
  importerId: string;
  exporterId: string;
  ratePct: number;
  resource: Resource | null;
}

export interface QuotaClause extends TreatyClauseBase {
  class: "restriction";
  kind: "quota";
  exporterId: string;
  importerId: string;
  resource: Resource;
  maxUnitsPerWeek: number;
  usedThisWeek: number;
}

export interface NonAggressionClause extends TreatyClauseBase {
  class: "restriction";
  kind: "non_aggression";
}

export interface SanctionClause extends TreatyClauseBase {
  class: "restriction";
  kind: "sanction";
  imposerId: string;
  targetId: string;
  resource: Resource | null;
}

export interface LoanClause extends TreatyClauseBase {
  class: "obligation";
  kind: "loan";
  creditorId: string;
  debtorId: string;
  principal: number;
  installment: number;
  intervalWeeks: number;
  firstPaymentDelayWeeks: number;
}

export interface ReparationsClause extends TreatyClauseBase {
  class: "obligation";
  kind: "reparations";
  payerId: string;
  payeeId: string;
  totalAmount: number;
  installment: number;
  intervalWeeks: number;
  firstPaymentDelayWeeks: number;
}

export type TreatyClause = PreferentialTradeClause | TariffClause | QuotaClause | NonAggressionClause | SanctionClause | LoanClause | ReparationsClause;

export type ObligationStatus = "pending" | "active" | "fulfilled" | "defaulted" | "suspended";
export type ObligationFailureReason = "insufficient_treasury" | "counterparty_missing" | "sanction_blocked" | "war_disruption" | "treaty_conflict" | "deliberate_refusal";

export interface TreatyObligation {
  id: string;
  treatyId: string;
  clauseId: string;
  payerId: string;
  payeeId: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  installment: number;
  intervalWeeks: number;
  nextDueWeek: number;
  status: ObligationStatus;
  missedPayments: number;
  failureReason: ObligationFailureReason | null;
}

export type TreatyTerminalReason = "term_completed" | "expiry" | "lawful_withdrawal" | "material_breach" | "counterparty_missing";

export interface Treaty {
  id: string;
  title: string;
  parties: [string, string];
  signedWeek: number;
  effectiveWeek: number;
  expiryWeek: number | null;
  withdrawalNoticeWeeks: number;
  status: TreatyStatus;
  clauses: TreatyClause[];
  obligations: TreatyObligation[];
  treasuryEscrow: Record<string, number>;
  activatedWeek: number | null;
  withdrawalRequestedBy: string | null;
  withdrawalEffectiveWeek: number | null;
  terminalReason: TreatyTerminalReason | null;
}

export interface TreatyViolation {
  id: string;
  treatyId: string;
  clauseId: string | null;
  violatorId: string;
  injuredPartyId: string;
  week: number;
  reason: ObligationFailureReason | "non_aggression_breach" | "sanction_breach" | "quota_breach" | "other";
  severity: number;
}

export type EventKind = "trade" | "war" | "peace" | "economy" | "politics" | "diplomacy" | "world";

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
  nextTreatyId: number;
  countries: Country[];
  geography: Geography;
  wars: War[];
  truces: Truce[];
  treaties: Treaty[];
  treatyViolations: TreatyViolation[];
  events: WorldEvent[];
}
