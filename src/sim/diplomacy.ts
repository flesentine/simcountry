import type {
  Country,
  DiplomaticCredibility,
  DiplomaticMemory,
  DiplomaticMemoryCategory,
  DiplomaticMemorySource,
  WorldState,
} from "../model/types";

const CREDIBILITY_BASELINE = 50;
const CREDIBILITY_HALF_LIFE_WEEKS = 520;

type DiplomaticMemoryCache = {
  observedLength: number;
  keys: Set<string>;
};

const MEMORY_CACHE = new WeakMap<WorldState, DiplomaticMemoryCache>();
// Country membership is fixed for a WorldState in the current simulation.
// A WeakSet gives hot credibility reads an O(1) readiness check while cloned /
// restored worlds naturally miss the cache and rebuild their derived state.
const DIPLOMATIC_STATE_READY = new WeakSet<WorldState>();

function memoryKey(memory: Pick<DiplomaticMemory, "sourceType" | "sourceId" | "category" | "subjectId" | "counterpartId">) {
  return `${memory.sourceType}|${memory.sourceId}|${memory.category}|${memory.subjectId}|${memory.counterpartId}`;
}

function diplomaticMemoryCache(world: WorldState) {
  let cache = MEMORY_CACHE.get(world);
  if (!cache || cache.observedLength > world.diplomaticMemories.length) {
    cache = {
      observedLength: world.diplomaticMemories.length,
      keys: new Set(world.diplomaticMemories.map(memoryKey)),
    };
    MEMORY_CACHE.set(world, cache);
    return cache;
  }
  if (cache.observedLength < world.diplomaticMemories.length) {
    for (let index = cache.observedLength; index < world.diplomaticMemories.length; index++) {
      cache.keys.add(memoryKey(world.diplomaticMemories[index]!));
    }
    cache.observedLength = world.diplomaticMemories.length;
  }
  return cache;
}

const MEMORY_HALF_LIFE_WEEKS: Record<DiplomaticMemoryCategory, number> = {
  agreement_signed: 104,
  commitment_honored: 260,
  commitment_breached: 520,
  lawful_withdrawal: 156,
  negotiation_rejected: 52,
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function countryById(world: WorldState, id: string) {
  return world.countries.find((country) => country.id === id);
}

export function ensureDiplomaticState(world: WorldState) {
  if (
    DIPLOMATIC_STATE_READY.has(world)
    && world.nextDiplomaticMemoryId !== undefined
    && world.diplomaticMemories !== undefined
    && world.diplomaticCredibility !== undefined
  ) return;

  world.diplomaticMemories ??= [];
  if (world.nextDiplomaticMemoryId === undefined) {
    const maxMemoryId = world.diplomaticMemories.reduce((max, memory) => {
      const numeric = Number(memory.id.startsWith("memory-") ? memory.id.slice("memory-".length) : NaN);
      return Number.isSafeInteger(numeric) ? Math.max(max, numeric) : max;
    }, 0);
    world.nextDiplomaticMemoryId = maxMemoryId + 1;
  }
  world.diplomaticCredibility ??= {};

  for (const observer of world.countries) {
    world.diplomaticCredibility[observer.id] ??= {};
    for (const subject of world.countries) {
      if (observer.id === subject.id) continue;
      world.diplomaticCredibility[observer.id]![subject.id] ??= {
        value: CREDIBILITY_BASELINE,
        lastUpdatedWeek: world.week,
      };
    }
  }
  DIPLOMATIC_STATE_READY.add(world);
}

function standing(world: WorldState, observerId: string, subjectId: string): DiplomaticCredibility {
  const existing = world.diplomaticCredibility?.[observerId]?.[subjectId];
  if (existing) return existing;
  ensureDiplomaticState(world);
  const observer = world.diplomaticCredibility[observerId] ?? (world.diplomaticCredibility[observerId] = {});
  return observer[subjectId] ?? (observer[subjectId] = {
    value: CREDIBILITY_BASELINE,
    lastUpdatedWeek: world.week,
  });
}

export function getCredibility(world: WorldState, observerId: string, subjectId: string) {
  if (observerId === subjectId) return CREDIBILITY_BASELINE;
  const current = standing(world, observerId, subjectId);
  const elapsed = Math.max(0, world.week - current.lastUpdatedWeek);
  const decay = 0.5 ** (elapsed / CREDIBILITY_HALF_LIFE_WEEKS);
  return clamp(CREDIBILITY_BASELINE + (current.value - CREDIBILITY_BASELINE) * decay);
}

function setCredibility(world: WorldState, observerId: string, subjectId: string, delta: number) {
  const current = getCredibility(world, observerId, subjectId);
  world.diplomaticCredibility[observerId]![subjectId] = {
    value: round(clamp(current + delta), 2),
    lastUpdatedWeek: world.week,
  };
}

function credibilityDelta(category: DiplomaticMemoryCategory, severity: number, direct: boolean) {
  if (category === "commitment_breached") return -severity * (direct ? 0.42 : 0.12);
  if (category === "commitment_honored") return severity * (direct ? 0.18 : 0.05);
  // Signing a promise is historical context, not evidence that it will be kept.
  if (category === "agreement_signed") return 0;
  return 0;
}

function updateDirectRelationship(
  world: WorldState,
  subjectId: string,
  counterpartId: string,
  category: DiplomaticMemoryCategory,
  severity: number,
) {
  const subject = countryById(world, subjectId);
  const counterpart = countryById(world, counterpartId);
  if (!subject || !counterpart) return;
  const observerRelation = counterpart.relations[subject.id];
  const subjectRelation = subject.relations[counterpart.id];
  if (!observerRelation || !subjectRelation) return;

  if (category === "commitment_breached") {
    observerRelation.trust = clamp(observerRelation.trust - severity * 0.26);
    observerRelation.tension = clamp(observerRelation.tension + severity * 0.22);
    subjectRelation.trust = clamp(subjectRelation.trust - severity * 0.12);
    subjectRelation.tension = clamp(subjectRelation.tension + severity * 0.15);
  } else if (category === "commitment_honored") {
    observerRelation.trust = clamp(observerRelation.trust + severity * 0.05);
    observerRelation.tension = clamp(observerRelation.tension - severity * 0.025);
    subjectRelation.trust = clamp(subjectRelation.trust + severity * 0.035);
    subjectRelation.tension = clamp(subjectRelation.tension - severity * 0.015);
  } else if (category === "agreement_signed") {
    observerRelation.trust = clamp(observerRelation.trust + 0.8);
    subjectRelation.trust = clamp(subjectRelation.trust + 0.5);
  }
}

export function recordDiplomaticMemory(
  world: WorldState,
  event: {
    subjectId: string;
    counterpartId: string;
    category: DiplomaticMemoryCategory;
    severity: number;
    sourceType: DiplomaticMemorySource;
    sourceId: string;
    description: string;
  },
) {
  ensureDiplomaticState(world);
  const cache = diplomaticMemoryCache(world);
  const key = memoryKey(event);
  if (cache.keys.has(key)) return null;

  const memory: DiplomaticMemory = {
    id: `memory-${world.nextDiplomaticMemoryId}`,
    week: world.week,
    subjectId: event.subjectId,
    counterpartId: event.counterpartId,
    category: event.category,
    severity: round(clamp(event.severity)),
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    description: event.description,
  };
  world.nextDiplomaticMemoryId += 1;
  world.diplomaticMemories.push(memory);
  cache.keys.add(key);
  cache.observedLength = world.diplomaticMemories.length;

  for (const observer of world.countries) {
    if (observer.id === event.subjectId) continue;
    const direct = observer.id === event.counterpartId;
    const delta = credibilityDelta(event.category, memory.severity, direct);
    if (delta !== 0) setCredibility(world, observer.id, event.subjectId, delta);
  }
  updateDirectRelationship(world, event.subjectId, event.counterpartId, event.category, memory.severity);
  return memory;
}

export function memorySalience(memory: DiplomaticMemory, currentWeek: number) {
  const age = Math.max(0, currentWeek - memory.week);
  const halfLife = MEMORY_HALF_LIFE_WEEKS[memory.category];
  return clamp(memory.severity * (0.5 ** (age / halfLife)), 0, 100);
}

export function recentDiplomaticMemories(world: WorldState, countryId: string, limit = 8) {
  ensureDiplomaticState(world);
  return world.diplomaticMemories
    .filter((memory) => memory.subjectId === countryId || memory.counterpartId === countryId)
    .map((memory) => ({ memory, salience: memorySalience(memory, world.week) }))
    .filter((entry) => entry.salience >= 1)
    .sort((a, b) => b.memory.week - a.memory.week || b.salience - a.salience)
    .slice(0, limit);
}

export function credibilityReputation(world: WorldState, subjectId: string) {
  ensureDiplomaticState(world);
  const observers = world.countries.filter((country) => country.id !== subjectId);
  if (!observers.length) return CREDIBILITY_BASELINE;
  return observers.reduce((sum, observer) => sum + getCredibility(world, observer.id, subjectId), 0) / observers.length;
}

export function treatyWithdrawalDecision(world: WorldState, country: Country, counterpart: Country) {
  const credibility = getCredibility(world, country.id, counterpart.id);
  const relation = country.relations[counterpart.id];
  const reliabilityLoss = Math.max(0, CREDIBILITY_BASELINE - credibility);
  const pressure = clamp(
    reliabilityLoss
      + (relation?.tension ?? 50) * 0.24
      + country.policy.expansionism * 0.07
      - country.policy.diplomacy * 0.10
      - country.government.agenda.diplomaticEngagement * 0.08,
  );

  // A single maximum-severity breach can only push an uninvolved observer from
  // baseline 50 to 38. The old <32 cutoff therefore ignored a severe public
  // credibility shock unless the observer was also the directly injured party.
  // Keep baseline relationships ineligible, but let genuinely damaged public
  // credibility become actionable for sufficiently concerned governments.
  const eligible = credibility < 42 && pressure >= 10;
  const chance = eligible ? clamp((pressure - 8) / 220, 0.012, 0.10) : 0;
  return { credibility, pressure, chance, eligible };
}

export function obligationRefusalPressure(world: WorldState, payer: Country, payee: Country) {
  const relation = payer.relations[payee.id];
  const reputation = credibilityReputation(world, payer.id);
  const counterpartCredibility = getCredibility(world, payer.id, payee.id);
  return clamp(
    15
      + payer.policy.expansionism * 0.18
      + payer.policy.risk * 0.14
      + payer.government.leader.traits.nationalism * 0.18
      + payer.government.leader.traits.corruption * 0.12
      + (relation?.tension ?? 50) * 0.20
      - payer.policy.diplomacy * 0.16
      - payer.government.agenda.diplomaticEngagement * 0.12
      - reputation * 0.10
      - counterpartCredibility * 0.05,
  );
}

export function nonAggressionBreachPressure(world: WorldState, attacker: Country, defender: Country) {
  const relation = attacker.relations[defender.id];
  const reputation = credibilityReputation(world, attacker.id);
  const counterpartCredibility = getCredibility(world, attacker.id, defender.id);
  const government = attacker.government;
  return clamp(
    20
      + attacker.policy.expansionism * 0.36
      + attacker.policy.risk * 0.22
      + government.agenda.defensePosture * 0.16
      + government.leader.traits.ambition * 0.14
      + (relation?.tension ?? 50) * 0.14
      - attacker.policy.diplomacy * 0.18
      - government.agenda.diplomaticEngagement * 0.14
      - reputation * 0.12
      - counterpartCredibility * 0.04,
  );
}

export function credibilitySummaryFor(country: Country, world: WorldState) {
  const reputation = credibilityReputation(world, country.id);
  const memories = recentDiplomaticMemories(world, country.id);
  const subjectMemories = world.diplomaticMemories.filter((memory) => memory.subjectId === country.id);
  return {
    reputation,
    breaches: subjectMemories.filter((memory) => memory.category === "commitment_breached").length,
    honored: subjectMemories.filter((memory) => memory.category === "commitment_honored").length,
    memories,
  };
}
