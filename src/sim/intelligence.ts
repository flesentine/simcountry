import type {
  Country,
  CountryIntelligence,
  IntelligenceEstimate,
  IntelligenceMetric,
  Resource,
  WorldState,
} from "../model/types";
import { createRng } from "./rng";
import { getSellerExportableSurplus } from "./trade";

export const RESOURCE_EXPORT_INTELLIGENCE_METRIC: Readonly<Record<Resource, IntelligenceMetric>> = {
  food: "foodExportable",
  energy: "energyExportable",
  metals: "metalsExportable",
  goods: "goodsExportable",
};

export const INTELLIGENCE_METRICS: readonly IntelligenceMetric[] = [
  "population",
  "treasury",
  "military",
  "readiness",
  "stability",
  "foodExportable",
  "energyExportable",
  "metalsExportable",
  "goodsExportable",
];

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function observationRng(world: WorldState, observerId: string, subjectId: string, metric: IntelligenceMetric, observedWeek: number) {
  const mixed = (
    (world.seed >>> 0)
    ^ hashString(observerId)
    ^ Math.imul(hashString(subjectId), 0x9e3779b1)
    ^ Math.imul(hashString(metric), 0x85ebca6b)
    ^ Math.imul(observedWeek + 1, 0xc2b2ae35)
  ) >>> 0;
  return createRng(mixed || 1);
}

function truthFor(subject: Country, metric: IntelligenceMetric) {
  if (metric === "population") return subject.population;
  if (metric === "treasury") return subject.treasury;
  if (metric === "military") return subject.military;
  if (metric === "readiness") return subject.readiness;
  if (metric === "stability") return subject.stability;
  if (metric === "foodExportable") return getSellerExportableSurplus(subject, "food");
  if (metric === "energyExportable") return getSellerExportableSurplus(subject, "energy");
  if (metric === "metalsExportable") return getSellerExportableSurplus(subject, "metals");
  return getSellerExportableSurplus(subject, "goods");
}

function observationConfidence(world: WorldState, observer: Country, subject: Country, metric: IntelligenceMetric) {
  const relation = observer.relations[subject.id];
  const foreignMinistry = observer.government.ministries.foreign;
  const tradeMinistry = observer.government.ministries.trade;
  const economicSignal = metric.endsWith("Exportable");
  const directBorder = world.geography.adjacency[observer.id]?.includes(subject.id) ?? false;
  const directRoute = world.geography.routes.some((route) =>
    (route.a === observer.id && route.b === subject.id) || (route.b === observer.id && route.a === subject.id),
  );
  const tradeSignal = Math.min(10, Math.max(0, relation?.tradeVolume ?? 0) * 0.7);
  const metricModifier = ({
    population: 7,
    treasury: -6,
    military: -4,
    readiness: -8,
    stability: 3,
    foodExportable: 2,
    energyExportable: 0,
    metalsExportable: -2,
    goodsExportable: 1,
  } satisfies Record<IntelligenceMetric, number>)[metric];

  return round(clamp(
    24
      + foreignMinistry.competence * 0.28
      + observer.policy.diplomacy * 0.12
      + (economicSignal ? tradeMinistry.competence * 0.16 + observer.policy.commerce * 0.06 : 0)
      + (directBorder ? 12 : 0)
      + (directRoute ? 7 : 0)
      + tradeSignal
      + metricModifier,
    20,
    92,
  ));
}

function estimateMetric(
  world: WorldState,
  observer: Country,
  subject: Country,
  metric: IntelligenceMetric,
  observedWeek: number,
): IntelligenceEstimate {
  const truth = truthFor(subject, metric);
  const confidence = observationConfidence(world, observer, subject, metric);
  const uncertaintyFactor = 1.15 - confidence * 0.0075;
  const rng = observationRng(world, observer.id, subject.id, metric, observedWeek);

  const economicSignal = metric.endsWith("Exportable");
  let radius: number;
  if (metric === "readiness") radius = 20 * uncertaintyFactor;
  else if (metric === "stability") radius = 16 * uncertaintyFactor;
  else {
    const relative = metric === "population" ? 0.18 : metric === "military" ? 0.24 : economicSignal ? 0.46 : 0.36;
    const floor = metric === "population" ? 1.5 : metric === "military" ? 4 : economicSignal ? 6 : 20;
    radius = Math.max(floor, Math.max(Math.abs(truth), floor) * relative * uncertaintyFactor);
  }

  const noise = (rng.next() * 2 - 1) * radius * 0.72;
  let value = truth + noise;
  let low = value - radius;
  let high = value + radius;
  if (metric === "population" || metric === "military" || economicSignal) {
    value = Math.max(0, value);
    low = Math.max(0, low);
  } else if (metric === "readiness" || metric === "stability") {
    value = clamp(value);
    low = clamp(low);
    high = clamp(high);
  }

  return {
    value: round(value),
    low: round(Math.min(low, value)),
    high: round(Math.max(high, value)),
    confidence,
    observedWeek,
  };
}

function observeCountry(world: WorldState, observer: Country, subject: Country, observedWeek: number): CountryIntelligence {
  return {
    subjectId: subject.id,
    estimates: Object.fromEntries(
      INTELLIGENCE_METRICS.map((metric) => [metric, estimateMetric(world, observer, subject, metric, observedWeek)]),
    ) as Record<IntelligenceMetric, IntelligenceEstimate>,
  };
}

export function initializeIntelligence(world: WorldState) {
  world.intelligence = { byObserver: {} };
  for (const observer of world.countries) {
    const subjects: Record<string, CountryIntelligence> = {};
    for (const subject of world.countries) {
      if (subject.id === observer.id) continue;
      subjects[subject.id] = observeCountry(world, observer, subject, world.week);
    }
    world.intelligence.byObserver[observer.id] = subjects;
  }
  return world.intelligence;
}

export function ensureIntelligence(world: WorldState) {
  world.intelligence ??= { byObserver: {} };
  for (const observer of world.countries) {
    const subjects = world.intelligence.byObserver[observer.id] ?? (world.intelligence.byObserver[observer.id] = {});
    for (const subject of world.countries) {
      if (subject.id === observer.id) {
        delete subjects[subject.id];
        continue;
      }
      const existing = subjects[subject.id];
      if (!existing) {
        subjects[subject.id] = observeCountry(world, observer, subject, world.week);
        continue;
      }

      // Serialized Phase 5.0/5.1 worlds do not contain the Phase 5.2 economic
      // signals. Repair only missing metrics so existing historical beliefs
      // remain intact instead of being silently re-observed on load.
      const estimates = existing.estimates as Partial<Record<IntelligenceMetric, IntelligenceEstimate>>;
      for (const metric of INTELLIGENCE_METRICS) {
        estimates[metric] ??= estimateMetric(world, observer, subject, metric, world.week);
      }
    }
  }
  return world.intelligence;
}

export function updateIntelligence(world: WorldState) {
  if (world.week === 0 || world.week % 13 !== 0) return;
  ensureIntelligence(world);

  const cycle = Math.floor(world.week / 13) - 1;
  for (let observerIndex = 0; observerIndex < world.countries.length; observerIndex++) {
    const observer = world.countries[observerIndex]!;
    const subjects = world.countries.filter((subject) => subject.id !== observer.id);
    if (!subjects.length) continue;
    const offset = (cycle * 2 + observerIndex) % subjects.length;
    for (let refreshIndex = 0; refreshIndex < Math.min(2, subjects.length); refreshIndex++) {
      const subject = subjects[(offset + refreshIndex) % subjects.length]!;
      world.intelligence.byObserver[observer.id]![subject.id] = observeCountry(world, observer, subject, world.week);
    }
  }
}

export function getCountryIntelligence(world: WorldState, observerId: string, subjectId: string) {
  if (observerId === subjectId) return null;
  return world.intelligence?.byObserver[observerId]?.[subjectId] ?? null;
}

export function effectiveIntelConfidence(estimate: IntelligenceEstimate, currentWeek: number) {
  const age = Math.max(0, currentWeek - estimate.observedWeek);
  return round(clamp(estimate.confidence * (0.5 ** (age / 104)), 5, 100));
}

export function intelligenceProfileConfidence(profile: CountryIntelligence, currentWeek: number) {
  return round(
    INTELLIGENCE_METRICS.reduce(
      (sum, metric) => sum + effectiveIntelConfidence(profile.estimates[metric], currentWeek),
      0,
    ) / INTELLIGENCE_METRICS.length,
  );
}

export function intelligenceProfileAge(profile: CountryIntelligence, currentWeek: number) {
  return Math.max(0, currentWeek - profile.estimates.population.observedWeek);
}
