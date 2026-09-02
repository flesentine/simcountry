import type {
  Country,
  Government,
  GovernmentAgenda,
  GovernmentObjective,
  GovernmentSystem,
  InstitutionalPosition,
  Ministry,
  MinistryKind,
  PolicyDomain,
  PolicyProfile,
  WorldState,
} from "../model/types";

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 10) / 10;
const DOMAINS: PolicyDomain[] = ["economy", "trade", "diplomacy", "defense", "stability"];
const MINISTRY_KINDS: MinistryKind[] = ["finance", "trade", "foreign", "defense", "interior"];
const FIRST_NAMES = ["Mira", "Tomas", "Elena", "Rafi", "Nadia", "Jonas", "Leila", "Marcus", "Anya", "Dorian", "Sofia", "Idris", "Talia", "Niko", "Sabine", "Oren"];
const LAST_NAMES = ["Vale", "Korin", "Saren", "Marek", "Ilyan", "Voss", "Darin", "Solari", "Neris", "Kade", "Varin", "Toren", "Arden", "Roth", "Selin", "Kerr"];
const SYSTEMS: GovernmentSystem[] = ["parliamentary_republic", "presidential_republic", "constitutional_monarchy", "one_party_state", "military_directorate"];

export type RngLike = { next(): number; int(min: number, max: number): number };

function personName(rng: RngLike, salt: number) {
  const first = FIRST_NAMES[(rng.int(0, FIRST_NAMES.length - 1) + salt) % FIRST_NAMES.length]!;
  const last = LAST_NAMES[(rng.int(0, LAST_NAMES.length - 1) + salt * 3) % LAST_NAMES.length]!;
  return `${first} ${last}`;
}

function positionFromPolicy(policy: PolicyProfile, rng: RngLike, bias: Partial<InstitutionalPosition> = {}): InstitutionalPosition {
  const base: InstitutionalPosition = {
    economy: 50 + (policy.commerce - 50) * 0.25,
    trade: policy.commerce,
    diplomacy: policy.diplomacy,
    defense: (policy.risk * 0.45 + policy.expansionism * 0.55),
    stability: 58 - policy.risk * 0.12 + policy.diplomacy * 0.12,
  };
  for (const domain of DOMAINS) {
    base[domain] = clamp((bias[domain] ?? base[domain]) + (rng.next() - 0.5) * 22, 5, 95);
  }
  return base;
}

function ministryName(kind: MinistryKind) {
  return ({ finance: "Ministry of Finance", trade: "Ministry of Trade", foreign: "Foreign Affairs", defense: "Ministry of Defense", interior: "Ministry of Interior" } as const)[kind];
}

function ministryBias(kind: MinistryKind, policy: PolicyProfile): Partial<InstitutionalPosition> {
  if (kind === "finance") return { economy: 66, stability: 62, defense: Math.max(28, policy.risk * 0.7) };
  if (kind === "trade") return { trade: Math.max(60, policy.commerce), diplomacy: Math.max(48, policy.diplomacy) };
  if (kind === "foreign") return { diplomacy: Math.max(58, policy.diplomacy), defense: 42 + policy.expansionism * 0.2 };
  if (kind === "defense") return { defense: Math.max(62, policy.expansionism), stability: 56 };
  return { stability: 72, economy: 54, defense: 44 };
}

function titleFor(system: GovernmentSystem) {
  return ({
    parliamentary_republic: "Prime Minister",
    presidential_republic: "President",
    constitutional_monarchy: "Chancellor",
    one_party_state: "General Secretary",
    military_directorate: "Chair of the Directorate",
  } as const)[system];
}

function deriveAgenda(government: Pick<Government, "leader" | "ministries">): { agenda: GovernmentAgenda; dissent: number } {
  const weighted = (domain: PolicyDomain) => {
    let total = government.leader.position[domain] * (1.2 + government.leader.authority / 100);
    let weight = 1.2 + government.leader.authority / 100;
    for (const ministry of Object.values(government.ministries)) {
      const ministryWeight = 0.5 + ministry.influence / 100 + ministry.competence / 250;
      total += ministry.position[domain] * ministryWeight;
      weight += ministryWeight;
    }
    return clamp(total / weight);
  };

  const domainAgenda = Object.fromEntries(DOMAINS.map((domain) => [domain, weighted(domain)])) as InstitutionalPosition;
  const allPositions = [government.leader.position, ...Object.values(government.ministries).map((m) => m.position)];
  const dissent = DOMAINS.reduce((sum, domain) => {
    const mean = allPositions.reduce((s, p) => s + p[domain], 0) / allPositions.length;
    return sum + allPositions.reduce((s, p) => s + Math.abs(p[domain] - mean), 0) / allPositions.length;
  }, 0) / DOMAINS.length;

  return {
    agenda: {
      taxEffort: clamp(44 + domainAgenda.economy * 0.38 + domainAgenda.stability * 0.10),
      civilSpending: clamp(28 + domainAgenda.stability * 0.58 - domainAgenda.defense * 0.10),
      tradeOpenness: domainAgenda.trade,
      diplomaticEngagement: domainAgenda.diplomacy,
      defensePosture: domainAgenda.defense,
      infrastructure: clamp(domainAgenda.economy * 0.42 + domainAgenda.trade * 0.38 + 10),
      internalSecurity: clamp(domainAgenda.stability * 0.72 + domainAgenda.defense * 0.18),
    },
    dissent: clamp(dissent * 2.2),
  };
}

function objectiveTemplates(country: Country, agenda: GovernmentAgenda) {
  return [
    { kind: "fiscal" as const, label: "Build fiscal reserves", assignedTo: "finance" as const, priority: agenda.taxEffort },
    { kind: "trade" as const, label: "Expand reliable trade", assignedTo: "trade" as const, priority: agenda.tradeOpenness },
    { kind: "diplomacy" as const, label: "Lower external tension", assignedTo: "foreign" as const, priority: agenda.diplomaticEngagement },
    { kind: "defense" as const, label: "Raise military readiness", assignedTo: "defense" as const, priority: agenda.defensePosture },
    { kind: "infrastructure" as const, label: "Upgrade strategic corridors", assignedTo: "trade" as const, priority: agenda.infrastructure },
    { kind: "stability" as const, label: "Strengthen domestic stability", assignedTo: "interior" as const, priority: Math.max(agenda.internalSecurity, 100 - country.stability) },
  ].sort((a, b) => b.priority - a.priority);
}

function makeObjectives(country: Country, agenda: GovernmentAgenda, week: number): GovernmentObjective[] {
  return objectiveTemplates(country, agenda).slice(0, 3).map((template, index) => ({
    id: `${country.id}-${week}-${template.kind}-${index}`,
    ...template,
    priority: round(template.priority),
    progress: 0,
    status: "active" as const,
  }));
}

export function createGovernment(countryName: string, countryId: string, policy: PolicyProfile, rng: RngLike, index: number): Government {
  const system = SYSTEMS[(index + rng.int(0, SYSTEMS.length - 1)) % SYSTEMS.length]!;
  const leaderPosition = positionFromPolicy(policy, rng, {
    trade: policy.commerce,
    diplomacy: policy.diplomacy,
    defense: policy.expansionism * 0.62 + policy.risk * 0.38,
  });
  const leader = {
    name: personName(rng, index),
    title: titleFor(system),
    competence: rng.int(38, 90),
    authority: rng.int(35, 88),
    traits: {
      riskTolerance: rng.int(15, 92),
      nationalism: rng.int(12, 94),
      pragmatism: rng.int(18, 94),
      corruption: rng.int(4, 58),
      ambition: rng.int(20, 95),
    },
    position: leaderPosition,
  };

  const ministries = {} as Record<MinistryKind, Ministry>;
  MINISTRY_KINDS.forEach((kind, ministryIndex) => {
    ministries[kind] = {
      kind,
      name: ministryName(kind),
      minister: personName(rng, index * 7 + ministryIndex + 1),
      competence: rng.int(32, 92),
      influence: rng.int(30, 88),
      loyalty: rng.int(30, 92),
      position: positionFromPolicy(policy, rng, ministryBias(kind, policy)),
    };
  });

  const provisional = { leader, ministries };
  const { agenda, dissent } = deriveAgenda(provisional);
  const stub = {
    id: countryId,
    name: countryName,
    stability: 65,
  } as Country;
  return {
    system,
    leader,
    ministries,
    agenda,
    legitimacy: rng.int(48, 82),
    cohesion: clamp(82 - dissent * 0.45),
    dissent,
    lastDecisionWeek: 0,
    objectives: makeObjectives(stub, agenda, 0),
  };
}

export function governmentModifiers(country: Country) {
  const agenda = country.government.agenda;
  const finance = country.government.ministries.finance;
  const defense = country.government.ministries.defense;
  return {
    taxMultiplier: clamp(0.82 + agenda.taxEffort / 300 + finance.competence / 1000, 0.82, 1.22),
    civilMultiplier: clamp(0.82 + agenda.civilSpending / 300, 0.82, 1.18),
    defenseMultiplier: clamp(0.78 + agenda.defensePosture / 260 + defense.competence / 1200, 0.8, 1.22),
    infrastructurePriority: agenda.infrastructure,
    tradeOpenness: agenda.tradeOpenness,
    diplomaticEngagement: agenda.diplomaticEngagement,
    internalSecurity: agenda.internalSecurity,
  };
}

function objectiveProgress(world: WorldState, country: Country, objective: GovernmentObjective) {
  if (objective.kind === "fiscal") return clamp(50 + country.treasury / Math.max(1, country.population * 7) * 50);
  if (objective.kind === "trade") {
    const volume = Object.values(country.relations).reduce((sum, relation) => sum + relation.tradeVolume, 0);
    return clamp(volume / Math.max(1, country.population) * 2.5);
  }
  if (objective.kind === "diplomacy") {
    const relations = Object.values(country.relations);
    const avgTension = relations.reduce((sum, relation) => sum + relation.tension, 0) / Math.max(1, relations.length);
    return clamp(100 - avgTension);
  }
  if (objective.kind === "defense") return clamp(country.readiness);
  if (objective.kind === "infrastructure") {
    const routes = world.geography.routes.filter((route) => route.a === country.id || route.b === country.id);
    const avg = routes.reduce((sum, route) => sum + route.level * route.condition / 100, 0) / Math.max(1, routes.length);
    return clamp(avg / 5 * 100);
  }
  return clamp(country.stability);
}

export function runGovernments(world: WorldState, rng: RngLike) {
  if (world.week % 13 !== 0) return [] as string[];
  const messages: string[] = [];

  for (const country of world.countries) {
    const government = country.government;
    const beforeAgenda = { ...government.agenda };
    const { agenda, dissent } = deriveAgenda(government);
    government.agenda = agenda;
    government.dissent = dissent;

    const atWar = world.wars.some((war) => war.a === country.id || war.b === country.id);
    const fiscalStress = country.treasury < 0 ? 10 : 0;
    const stabilityStress = Math.max(0, 50 - country.stability) * 0.35;
    government.cohesion = clamp(government.cohesion + (55 - dissent) * 0.025 - fiscalStress * 0.08 - (atWar ? 0.04 : 0));
    government.legitimacy = clamp(government.legitimacy + (country.stability - 55) * 0.018 + (country.treasury >= 0 ? 0.05 : -0.12) - stabilityStress * 0.02);

    // Cabinet policy becomes the behaviorally effective state policy, but moves gradually.
    const leader = government.leader;
    const riskTarget = clamp(agenda.defensePosture * 0.56 + leader.traits.riskTolerance * 0.44);
    const expansionTarget = clamp(agenda.defensePosture * 0.46 + leader.traits.nationalism * 0.54);
    country.policy.risk = round(country.policy.risk + (riskTarget - country.policy.risk) * 0.08);
    country.policy.expansionism = round(country.policy.expansionism + (expansionTarget - country.policy.expansionism) * 0.07);
    country.policy.commerce = round(country.policy.commerce + (agenda.tradeOpenness - country.policy.commerce) * 0.10);
    country.policy.diplomacy = round(country.policy.diplomacy + (agenda.diplomaticEngagement - country.policy.diplomacy) * 0.10);

    for (const objective of government.objectives) {
      objective.progress = round(objectiveProgress(world, country, objective));
      if (objective.progress >= 82) objective.status = "achieved";
    }
    const achieved = government.objectives.filter((objective) => objective.status === "achieved").length;
    if (achieved > 0 || government.objectives.length < 3 || world.week - government.lastDecisionWeek >= 52) {
      government.objectives = makeObjectives(country, agenda, world.week);
    }
    government.lastDecisionWeek = world.week;

    const agendaShift = Math.max(...Object.keys(agenda).map((key) => Math.abs(agenda[key as keyof GovernmentAgenda] - beforeAgenda[key as keyof GovernmentAgenda])));
    if (world.week % 52 === 0 || agendaShift > 8 || achieved > 0) {
      const top = government.objectives[0];
      messages.push(`${country.name}'s ${leader.title} ${leader.name} sets a cabinet agenda led by ${top?.label.toLowerCase() ?? "state capacity"}; cohesion ${Math.round(government.cohesion)}%, dissent ${Math.round(government.dissent)}%.`);
    }

    // Low cohesion can cause limited cabinet reshuffles without introducing elections/coups yet.
    if (government.cohesion < 28 && rng.next() < 0.08) {
      const weakest = Object.values(government.ministries).sort((a, b) => a.loyalty + a.competence - (b.loyalty + b.competence))[0]!;
      weakest.minister = personName(rng, world.week + country.id.length);
      weakest.competence = clamp(weakest.competence + rng.int(-8, 15), 25, 95);
      weakest.loyalty = rng.int(48, 88);
      government.cohesion = clamp(government.cohesion + 4);
      messages.push(`${country.name} reshuffles ${weakest.name} after sustained cabinet conflict; ${weakest.minister} takes the portfolio.`);
    }
  }

  return messages;
}
