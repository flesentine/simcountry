import type {
  Country,
  CountryIntelligence,
  EventMessage,
  IntelligenceCollectionMethod,
  IntelligenceEstimate,
  IntelligenceMetric,
  MilitaryDeceptionPosture,
  Resource,
  SecretTreatyIntelligence,
  Treaty,
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

function secretTreatyDiscoveryRng(world: WorldState, observerId: string, treatyId: string, observedWeek: number) {
  const mixed = (
    (world.seed >>> 0)
    ^ Math.imul(hashString(observerId), 0x9e3779b1)
    ^ Math.imul(hashString(treatyId), 0x85ebca6b)
    ^ Math.imul(observedWeek + 1, 0xc2b2ae35)
    ^ 0x51f15e5d
  ) >>> 0;
  return createRng(mixed || 1);
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

export function militaryDeceptionPostureFor(world: WorldState, country: Country): MilitaryDeceptionPosture {
  const government = country.government;
  const maxTension = Math.max(0, ...Object.values(country.relations).map((relation) => relation.tension));
  const concealPressure =
    country.policy.expansionism * 0.36
    + country.policy.risk * 0.14
    + government.leader.traits.ambition * 0.18
    + government.agenda.defensePosture * 0.18
    + government.ministries.defense.competence * 0.08;
  const exaggeratePressure =
    maxTension * 0.34
    + government.agenda.defensePosture * 0.22
    + government.leader.traits.nationalism * 0.16
    + (100 - country.stability) * 0.10
    + government.ministries.defense.competence * 0.08;

  const mode = concealPressure >= 58 && concealPressure >= exaggeratePressure + 4
    ? "conceal"
    : exaggeratePressure >= 52
      ? "exaggerate"
      : "none";
  const strengthPct = mode === "none"
    ? 0
    : round(clamp(
      5
        + government.ministries.defense.competence * 0.08
        + government.agenda.internalSecurity * 0.05
        + government.leader.traits.nationalism * 0.025,
      6,
      18,
    ));

  return { mode, strengthPct, updatedWeek: world.week };
}

export function updateMilitaryDeceptionPostures(world: WorldState) {
  world.intelligence.deceptionByCountry ??= {};
  for (const country of world.countries) {
    world.intelligence.deceptionByCountry[country.id] = militaryDeceptionPostureFor(world, country);
  }
  return world.intelligence.deceptionByCountry;
}

export function militaryDeceptionObservationBias(
  world: WorldState,
  observer: Country,
  subject: Country,
  metric: IntelligenceMetric,
  collectionMethod: IntelligenceCollectionMethod,
) {
  if (metric !== "military" && metric !== "readiness") return 0;
  const posture = world.intelligence.deceptionByCountry?.[subject.id];
  if (!posture || posture.mode === "none" || posture.strengthPct <= 0) return 0;

  const foreignCompetence = observer.government.ministries.foreign.competence / 100;
  const basePenetration = collectionMethod === "recon" ? 0.48 : collectionMethod === "routine" ? 0.18 : 0.10;
  const competencePenetration = foreignCompetence * (collectionMethod === "recon" ? 0.26 : 0.12);
  const penetration = clamp(basePenetration + competencePenetration, 0, 0.78);
  const residualStrength = posture.strengthPct * (1 - penetration);
  const direction = posture.mode === "conceal" ? -1 : 1;

  return metric === "military"
    ? subject.military * direction * residualStrength / 100
    : direction * residualStrength * 0.75;
}

function observationConfidence(
  world: WorldState,
  observer: Country,
  subject: Country,
  metric: IntelligenceMetric,
  confidenceBonus = 0,
) {
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
      + metricModifier
      + confidenceBonus,
    20,
    confidenceBonus > 0 ? 98 : 92,
  ));
}

function estimateMetric(
  world: WorldState,
  observer: Country,
  subject: Country,
  metric: IntelligenceMetric,
  observedWeek: number,
  collectionMethod: IntelligenceCollectionMethod = "routine",
  confidenceBonus = 0,
): IntelligenceEstimate {
  const truth = truthFor(subject, metric);
  const apparentTruth = truth + militaryDeceptionObservationBias(world, observer, subject, metric, collectionMethod);
  const confidence = observationConfidence(world, observer, subject, metric, confidenceBonus);
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
  let value = apparentTruth + noise;
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

function secretTreatyDiscoveryConfidence(world: WorldState, observer: Country, subject: Country) {
  const directBorder = world.geography.adjacency[observer.id]?.includes(subject.id) ?? false;
  const directRoute = world.geography.routes.some((route) =>
    (route.a === observer.id && route.b === subject.id)
    || (route.b === observer.id && route.a === subject.id),
  );
  return round(clamp(
    42
      + observer.government.ministries.foreign.competence * 0.34
      + observer.policy.diplomacy * 0.12
      + (directBorder ? 8 : 0)
      + (directRoute ? 5 : 0),
    45,
    96,
  ));
}

export function secretTreatyDiscoveryChance(
  world: WorldState,
  observer: Country,
  subject: Country,
  treaty: Treaty,
  alreadyKnown = false,
) {
  const confidence = secretTreatyDiscoveryConfidence(world, observer, subject);
  const ageWeeks = Math.max(0, world.week - treaty.signedWeek);
  const ageBonus = Math.min(0.08, ageWeeks / 520 * 0.08);
  return Math.min(0.62, 0.04 + confidence / 100 * 0.30 + ageBonus + (alreadyKnown ? 0.12 : 0));
}

function secretTreatyIsOperational(treaty: Treaty) {
  return treaty.status === "pending" || treaty.status === "active";
}

function collectSecretTreatyIntelligenceReady(
  world: WorldState,
  observer: Country,
  subject: Country,
  observedWeek: number,
) {
  const observerKnowledge = world.intelligence.secretTreatiesByObserver[observer.id]!;
  const discoveries: SecretTreatyIntelligence[] = [];

  for (const treaty of world.treaties) {
    if (treaty.visibility !== "secret") continue;
    if (!treaty.parties.includes(subject.id) || treaty.parties.includes(observer.id)) continue;

    const existing = observerKnowledge[treaty.id];
    if (!existing && !secretTreatyIsOperational(treaty)) continue;

    const chance = secretTreatyDiscoveryChance(world, observer, subject, treaty, Boolean(existing));
    const rng = secretTreatyDiscoveryRng(world, observer.id, treaty.id, observedWeek);
    if (rng.next() > chance) continue;

    const confidence = secretTreatyDiscoveryConfidence(world, observer, subject);
    const snapshot: SecretTreatyIntelligence = {
      treatyId: treaty.id,
      title: treaty.title,
      parties: [...treaty.parties] as [string, string],
      status: treaty.status,
      discoveredWeek: existing?.discoveredWeek ?? observedWeek,
      lastConfirmedWeek: observedWeek,
      confidence,
      sourceSubjectId: subject.id,
    };
    observerKnowledge[treaty.id] = snapshot;
    if (!existing) discoveries.push(snapshot);
  }

  return discoveries;
}

export function collectSecretTreatyIntelligence(
  world: WorldState,
  observer: Country,
  subject: Country,
  observedWeek: number,
) {
  ensureIntelligence(world);
  return collectSecretTreatyIntelligenceReady(world, observer, subject, observedWeek);
}

export function getSecretTreatyIntelligence(world: WorldState, observerId: string) {
  return Object.values(world.intelligence?.secretTreatiesByObserver?.[observerId] ?? {});
}

export function effectiveSecretTreatyConfidence(intel: SecretTreatyIntelligence, currentWeek: number) {
  const age = Math.max(0, currentWeek - intel.lastConfirmedWeek);
  return round(clamp(intel.confidence * (0.5 ** (age / 104)), 5, 100));
}

export function collectCountryIntelligence(
  world: WorldState,
  observer: Country,
  subject: Country,
  observedWeek: number,
  collectionMethod: IntelligenceCollectionMethod = "routine",
  confidenceBonus = 0,
): CountryIntelligence {
  return {
    subjectId: subject.id,
    estimates: Object.fromEntries(
      INTELLIGENCE_METRICS.map((metric) => [metric, estimateMetric(world, observer, subject, metric, observedWeek, collectionMethod, confidenceBonus)]),
    ) as Record<IntelligenceMetric, IntelligenceEstimate>,
    collectionMethod,
  };
}

export function initializeIntelligence(world: WorldState) {
  world.intelligence = { byObserver: {}, reconByObserver: {}, deceptionByCountry: {}, secretTreatiesByObserver: {} };
  updateMilitaryDeceptionPostures(world);
  for (const observer of world.countries) {
    const subjects: Record<string, CountryIntelligence> = {};
    for (const subject of world.countries) {
      if (subject.id === observer.id) continue;
      subjects[subject.id] = collectCountryIntelligence(world, observer, subject, world.week, "baseline");
    }
    world.intelligence.byObserver[observer.id] = subjects;
    world.intelligence.reconByObserver[observer.id] = null;
    world.intelligence.secretTreatiesByObserver[observer.id] = {};
  }
  return world.intelligence;
}

export function ensureIntelligence(world: WorldState) {
  world.intelligence ??= { byObserver: {}, reconByObserver: {}, deceptionByCountry: {}, secretTreatiesByObserver: {} };
  world.intelligence.reconByObserver ??= {};
  world.intelligence.deceptionByCountry ??= {};
  world.intelligence.secretTreatiesByObserver ??= {};
  for (const country of world.countries) {
    world.intelligence.deceptionByCountry[country.id] ??= militaryDeceptionPostureFor(world, country);
  }
  for (const observer of world.countries) {
    const subjects = world.intelligence.byObserver[observer.id] ?? (world.intelligence.byObserver[observer.id] = {});
    world.intelligence.reconByObserver[observer.id] ??= null;
    world.intelligence.secretTreatiesByObserver[observer.id] ??= {};
    for (const subject of world.countries) {
      if (subject.id === observer.id) {
        delete subjects[subject.id];
        continue;
      }
      const existing = subjects[subject.id];
      if (!existing) {
        subjects[subject.id] = collectCountryIntelligence(world, observer, subject, world.week, "routine");
        continue;
      }
      existing.collectionMethod ??= "routine";

      // Serialized Phase 5.0/5.1 worlds do not contain the Phase 5.2 economic
      // signals. Repair only missing metrics so existing historical beliefs
      // remain intact instead of being silently re-observed on load.
      const estimates = existing.estimates as Partial<Record<IntelligenceMetric, IntelligenceEstimate>>;
      for (const metric of INTELLIGENCE_METRICS) {
        estimates[metric] ??= estimateMetric(world, observer, subject, metric, world.week, existing.collectionMethod ?? "routine");
      }
    }
  }
  return world.intelligence;
}

function reconnaissanceConfidenceBonus(observer: Country) {
  return round(clamp(
    8
      + observer.government.ministries.foreign.competence * 0.08
      + observer.policy.diplomacy * 0.04,
    8,
    20,
  ));
}

export function selectReconTargetFromBelief(world: WorldState, observer: Country) {
  const profiles = world.intelligence?.byObserver[observer.id];
  if (!profiles) return null;

  const candidates = world.countries
    .filter((subject) => subject.id !== observer.id)
    .map((subject) => {
      const profile = profiles[subject.id];
      if (!profile) return null;
      const relation = observer.relations[subject.id];
      const age = intelligenceProfileAge(profile, world.week);
      const confidence = intelligenceProfileConfidence(profile, world.week);
      const directBorder = world.geography.adjacency[observer.id]?.includes(subject.id) ?? false;
      const directRoute = world.geography.routes.some((route) =>
        (route.a === observer.id && route.b === subject.id)
        || (route.b === observer.id && route.a === subject.id),
      );
      const priorityScore = round(
        age * 0.45
          + (100 - confidence) * 0.35
          + (relation?.tension ?? 50) * 0.25
          + (directBorder ? 12 : 0)
          + (directRoute ? 5 : 0),
      );
      return { subjectId: subject.id, priorityScore };
    })
    .filter((candidate): candidate is { subjectId: string; priorityScore: number } => candidate !== null)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.subjectId.localeCompare(b.subjectId));

  return candidates[0] ?? null;
}

export function updateIntelligence(world: WorldState) {
  if (world.week === 0 || world.week % 13 !== 0) return [] as EventMessage[];
  ensureIntelligence(world);
  updateMilitaryDeceptionPostures(world);

  const cycle = Math.floor(world.week / 13) - 1;
  const assignments: string[] = [];
  const events: EventMessage[] = [];
  for (let observerIndex = 0; observerIndex < world.countries.length; observerIndex++) {
    const observer = world.countries[observerIndex]!;
    const subjects = world.countries.filter((subject) => subject.id !== observer.id);
    if (!subjects.length) continue;

    const reconTarget = selectReconTargetFromBelief(world, observer);
    if (reconTarget) {
      const subject = subjects.find((candidate) => candidate.id === reconTarget.subjectId);
      if (subject) {
        world.intelligence.reconByObserver[observer.id] = {
          subjectId: subject.id,
          assignedWeek: world.week,
          priorityScore: reconTarget.priorityScore,
        };
        world.intelligence.byObserver[observer.id]![subject.id] = collectCountryIntelligence(
          world,
          observer,
          subject,
          world.week,
          "recon",
          reconnaissanceConfidenceBonus(observer),
        );
        assignments.push(`${observer.name}→${subject.name}`);
        for (const discovery of collectSecretTreatyIntelligenceReady(world, observer, subject, world.week)) {
          const partyNames = discovery.parties
            .map((countryId) => world.countries.find((country) => country.id === countryId)?.name ?? countryId)
            .join(" and ");
          events.push({
            text: `${observer.name} intelligence uncovers ${discovery.title} between ${partyNames} through active reconnaissance of ${subject.name}.`,
            audienceCountryIds: [observer.id],
            publicText: null,
          });
        }
      }
    } else {
      world.intelligence.reconByObserver[observer.id] = null;
    }

    const offset = (cycle + observerIndex) % subjects.length;
    for (let step = 0; step < subjects.length; step++) {
      const routineSubject = subjects[(offset + step) % subjects.length]!;
      if (routineSubject.id === reconTarget?.subjectId) continue;
      world.intelligence.byObserver[observer.id]![routineSubject.id] = collectCountryIntelligence(
        world,
        observer,
        routineSubject,
        world.week,
        "routine",
      );
      break;
    }
  }

  if (assignments.length) {
    events.unshift(`Active reconnaissance retasked from subjective collection priorities: ${assignments.join(", ")}.`);
  }
  return events;
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
