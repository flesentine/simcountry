import { getCredibility, memorySalience, treatyWithdrawalDecision } from "./diplomacy";
import { eventTextForObserver } from "./events";
import { effectiveSecretNegotiationConfidence, effectiveSecretTreatyConfidence, getSecretNegotiationIntelligence, getSecretTreatyIntelligence } from "./intelligence";
import { diplomaticBandwidth } from "./negotiation";
import { getActiveTreaties, isNonAggressionActive, registerTreaty } from "./treaties";
import { getSellerExportableSurplus } from "./trade";
import { createInitialWorld, getActiveTruce, tickWeek } from "./world";

const YEARS = 500;
const SEEDS = Array.from({ length: 100 }, (_, index) => index + 1);
SEEDS[0] = 1978;

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function proposalById(world: ReturnType<typeof createInitialWorld>, id: string | null) {
  if (!id) return undefined;
  const numeric = Number(id.startsWith("proposal-") ? id.slice("proposal-".length) : NaN);
  if (Number.isInteger(numeric) && numeric > 0 && world.proposals[numeric - 1]?.id === id) return world.proposals[numeric - 1];
  return world.proposals.find((proposal) => proposal.id === id);
}

let totalFloorCountries = 0;
let worldsAtMilitaryFloor = 0;
let upgradedRoutes = 0;
let finalChokepoints = 0;
let treatyFixtures = 0;
let fulfilledFixtureObligations = 0;
let treatyViolations = 0;
let deliberateTreatyViolations = 0;
let diplomaticMemories = 0;
let lawfulWithdrawalMemories = 0;
let withdrawalRequests = 0;
let withdrawnTreaties = 0;
let expiredAfterWithdrawalNotice = 0;
let withdrawalReviewOpportunities = 0;
let eligibleWithdrawalReviews = 0;
let withdrawalChanceMass = 0;
let maxWithdrawalChance = 0;
const withdrawalSamples: { seed: number; week: number; subjectId: string; counterpartId: string; sourceId: string }[] = [];
let minCredibility = 100;
let maxCredibility = 0;
let negotiationsStarted = 0;
let acceptedNegotiations = 0;
let rejectedNegotiations = 0;
let counterProposals = 0;
let beliefDrivenEconomicNegotiations = 0;
let beliefDrivenEconomicNegotiationEvents = 0;
let beliefDrivenLoanEvaluations = 0;
let beliefDrivenLoanEvaluationEvents = 0;
let worldsWithNegotiations = 0;
let worldsWithAcceptedNegotiations = 0;
let maxNegotiationsPerWorld = 0;
let maxProposalsPerWorld = 0;
let maxTreatiesPerWorld = 0;
const finalReadiness: number[] = [];
const finalTension: number[] = [];
const finalTreasuries: number[] = [];
const finalTreasuryPerCapita: number[] = [];
const finalWorldTreasuryPerCapita: number[] = [];
let maxTreasuryCountry = { seed: 0, country: "", treasury: Number.NEGATIVE_INFINITY, population: 0, treasuryPerCapita: Number.NEGATIVE_INFINITY };
const finalCityPopulations: number[] = [];
const finalLegitimacy: number[] = [];
const finalCohesion: number[] = [];
const finalDissent: number[] = [];
let intelligenceProfiles = 0;
let staleIntelligenceProfiles = 0;
let activeReconAssignments = 0;
let currentReconProfiles = 0;
let reconnaissanceEvents = 0;
let restrictedHistoryEvents = 0;
let sanitizedHistoryEvents = 0;
let privateProvenanceEvents = 0;
let secretTreaties = 0;
let secretNegotiations = 0;
let worldsWithSecretTreaties = 0;
let secretTreatyHistoryEvents = 0;
let discoveredSecretTreatyIntel = 0;
let observersWithSecretDiscoveries = 0;
let staleSecretTreatyIntel = 0;
let secretTreatyStatusDivergences = 0;
let secretTreatyDiscoveryEvents = 0;
let discoveredSecretNegotiationIntel = 0;
let observersWithSecretNegotiationDiscoveries = 0;
let staleSecretNegotiationIntel = 0;
let secretNegotiationStatusDivergences = 0;
let secretNegotiationDiscoveryEvents = 0;
let concealmentPostures = 0;
let exaggerationPostures = 0;
let currentDeceptionAffectedProfiles = 0;
let currentReconAgainstDeception = 0;
let imperfectMilitaryEstimates = 0;
let imperfectEconomicAvailabilityEstimates = 0;
let successfulBeliefDrivenTradeEvents = 0;
const intelligenceConfidence: number[] = [];
let beliefDrivenWarStarts = 0;
let warsUnderestimatingDefenderPower = 0;
let warsOverestimatingDefenderPower = 0;
let maxWarIntelligenceAge = 0;
const warIntelligenceConfidence: number[] = [];
const warDecisionSamples: { seed: number; week: number; attackerId: string; defenderId: string; perceivedDefenderMilitary: number; perceivedDefenderReadiness: number; intelligenceConfidence: number; intelligenceAgeWeeks: number }[] = [];

for (let seedIndex = 0; seedIndex < SEEDS.length; seedIndex++) {
  const seed = SEEDS[seedIndex]!;
  const world = createInitialWorld(seed);
  let observedDiplomaticMemoryCount = world.diplomaticMemories.length;
  const fixtureRoute = world.geography.routes[0]!;
  const fixtureA = world.countries.find((country) => country.id === fixtureRoute.a)!;
  const fixtureB = world.countries.find((country) => country.id === fixtureRoute.b)!;
  const fixture = registerTreaty(world, {
    title: "Stress commerce and credit compact",
    parties: [fixtureA.id, fixtureB.id],
    expiryWeek: 104,
    withdrawalNoticeWeeks: 13,
    clauses: [
      { kind: "preferential_trade", grantorId: fixtureB.id, beneficiaryId: fixtureA.id, discountPct: 5, resource: "goods" },
      { kind: "quota", exporterId: fixtureA.id, importerId: fixtureB.id, resource: "goods", maxUnitsPerWeek: 25 },
      { kind: "loan", creditorId: fixtureA.id, debtorId: fixtureB.id, principal: 4, installment: 1, intervalWeeks: 13, firstPaymentDelayWeeks: 13 },
      { kind: "non_aggression" },
    ],
  });
  invariant(fixture.ok, `seed ${seed}: treaty stress fixture failed to register${fixture.ok ? "" : `: ${fixture.errors.join(", ")}`}`);
  treatyFixtures++;

  for (let week = 0; week < YEARS * 52; week++) {
    // Measure the autonomous withdrawal decision surface without consuming RNG
    // or mutating state. Sample immediately before each quarterly review.
    if ((world.week + 1) % 13 === 0) {
      for (const treaty of getActiveTreaties(world).filter((candidate) => candidate.withdrawalRequestedBy === null)) {
        const [aId, bId] = treaty.parties;
        const a = world.countries.find((country) => country.id === aId);
        const b = world.countries.find((country) => country.id === bId);
        if (!a || !b) continue;
        for (const [country, counterpart] of [[a, b], [b, a]] as const) {
          withdrawalReviewOpportunities++;
          const decision = treatyWithdrawalDecision(world, country, counterpart);
          if (!decision.eligible) continue;
          eligibleWithdrawalReviews++;
          withdrawalChanceMass += decision.chance;
          maxWithdrawalChance = Math.max(maxWithdrawalChance, decision.chance);
        }
      }
    }
    tickWeek(world);

    // Credibility recovers toward baseline over time, so final-year snapshots
    // cannot prove that a breach ever caused reputational damage. Sample only
    // when new diplomatic memories are created; this captures the actual
    // post-event credibility shock without adding a 56-pair scan every week.
    for (let memoryIndex = observedDiplomaticMemoryCount; memoryIndex < world.diplomaticMemories.length; memoryIndex++) {
      const memory = world.diplomaticMemories[memoryIndex]!;
      if (memory.category !== "commitment_breached") continue;
      for (const observer of world.countries) {
        if (observer.id === memory.subjectId) continue;
        const credibility = getCredibility(world, observer.id, memory.subjectId);
        invariant(Number.isFinite(credibility) && credibility >= 0 && credibility <= 100, `seed ${seed} week ${world.week}: breach credibility out of bounds`);
        minCredibility = Math.min(minCredibility, credibility);
      }
    }
    observedDiplomaticMemoryCount = world.diplomaticMemories.length;

    const participants = new Set<string>();
    for (const war of world.wars) {
      invariant(!participants.has(war.a), `seed ${seed} week ${world.week}: ${war.a} entered multiple wars`);
      invariant(!participants.has(war.b), `seed ${seed} week ${world.week}: ${war.b} entered multiple wars`);
      invariant(!getActiveTruce(world, war.a, war.b), `seed ${seed} week ${world.week}: active war overlaps a truce`);
      invariant(!isNonAggressionActive(world, war.a, war.b), `seed ${seed} week ${world.week}: active war overlaps a non-aggression treaty`);
      invariant(Number.isFinite(war.supplyA) && war.supplyA >= 8 && war.supplyA <= 100, `seed ${seed} week ${world.week}: supplyA out of bounds`);
      invariant(Number.isFinite(war.supplyB) && war.supplyB >= 8 && war.supplyB <= 100, `seed ${seed} week ${world.week}: supplyB out of bounds`);
      invariant(Number.isFinite(war.momentum) && war.momentum >= -100 && war.momentum <= 100, `seed ${seed} week ${world.week}: momentum out of bounds`);
      invariant(Boolean(war.frontCellId), `seed ${seed} week ${world.week}: active war lost its physical front`);
      invariant(Boolean(world.geography.cells.find((cell) => cell.id === war.frontCellId)), `seed ${seed} week ${world.week}: missing front cell ${war.frontCellId}`);
      if (war.startWeek === world.week) {
        invariant(Boolean(war.decisionBasis), `seed ${seed} week ${world.week}: autonomous war ${war.id} lacks intelligence provenance`);
        const basis = war.decisionBasis!;
        invariant(
          [basis.perceivedDefenderMilitary, basis.perceivedDefenderReadiness, basis.intelligenceConfidence, basis.intelligenceAgeWeeks, basis.intelligenceObservedWeek].every(Number.isFinite),
          `seed ${seed} week ${world.week}: war ${war.id} has non-finite intelligence provenance`,
        );
        invariant(basis.perceivedDefenderMilitary >= 0, `seed ${seed} week ${world.week}: negative perceived defender military`);
        invariant(basis.perceivedDefenderReadiness >= 0 && basis.perceivedDefenderReadiness <= 100, `seed ${seed} week ${world.week}: perceived defender readiness out of bounds`);
        invariant(basis.intelligenceConfidence >= 5 && basis.intelligenceConfidence <= 100, `seed ${seed} week ${world.week}: war intelligence confidence out of bounds`);
        invariant(basis.intelligenceAgeWeeks >= 0 && basis.intelligenceObservedWeek <= world.week, `seed ${seed} week ${world.week}: invalid war intelligence age`);
        beliefDrivenWarStarts++;
        warIntelligenceConfidence.push(basis.intelligenceConfidence);
        if (warDecisionSamples.length < 8) {
          const defenderId = war.attacker === war.a ? war.b : war.a;
          warDecisionSamples.push({
            seed,
            week: world.week,
            attackerId: war.attacker,
            defenderId,
            perceivedDefenderMilitary: basis.perceivedDefenderMilitary,
            perceivedDefenderReadiness: basis.perceivedDefenderReadiness,
            intelligenceConfidence: basis.intelligenceConfidence,
            intelligenceAgeWeeks: basis.intelligenceAgeWeeks,
          });
        }
        maxWarIntelligenceAge = Math.max(maxWarIntelligenceAge, basis.intelligenceAgeWeeks);

        const defenderId = war.attacker === war.a ? war.b : war.a;
        const defender = world.countries.find((country) => country.id === defenderId)!;
        const perceivedPower = basis.perceivedDefenderMilitary * (0.6 + basis.perceivedDefenderReadiness / 100);
        const truePower = defender.military * (0.6 + defender.readiness / 100);
        if (perceivedPower < truePower * 0.95) warsUnderestimatingDefenderPower++;
        if (perceivedPower > truePower * 1.05) warsOverestimatingDefenderPower++;
      }
      participants.add(war.a);
      participants.add(war.b);
    }

    for (const route of world.geography.routes) {
      invariant(Number.isFinite(route.capacity) && route.capacity > 0, `seed ${seed} week ${world.week}: invalid route capacity`);
      invariant(route.level >= 1 && route.level <= 5, `seed ${seed} week ${world.week}: route level out of bounds`);
      invariant(route.condition >= 35 && route.condition <= 100, `seed ${seed} week ${world.week}: route condition out of bounds`);
      invariant(route.usedThisWeek >= 0 && route.usedThisWeek <= route.capacity + 0.0001, `seed ${seed} week ${world.week}: route capacity exceeded`);
      if (route.blockedBy) invariant(world.countries.some((country) => country.id === route.blockedBy), `seed ${seed} week ${world.week}: invalid blockading country`);
    }

    const activeTreaties = getActiveTreaties(world);
    invariant(activeTreaties.length < 64, `seed ${seed} week ${world.week}: active treaty state exploded`);
    for (const treaty of activeTreaties) {
      invariant(treaty.expiryWeek === null || world.week < treaty.expiryWeek, `seed ${seed} week ${world.week}: active treaty passed expiry`);
      invariant(treaty.withdrawalEffectiveWeek === null || world.week < treaty.withdrawalEffectiveWeek, `seed ${seed} week ${world.week}: active treaty passed withdrawal date`);
      for (const clause of treaty.clauses) {
        if (clause.kind === "quota") invariant(clause.usedThisWeek >= 0 && clause.usedThisWeek <= clause.maxUnitsPerWeek + 0.0001, `seed ${seed} week ${world.week}: treaty quota exceeded`);
      }
    }
    for (const treaty of world.treaties.slice(-64)) {
      invariant(treaty.status !== "pending" || world.week < treaty.effectiveWeek, `seed ${seed} week ${world.week}: treaty stuck pending after effective date`);
    }

    const openNegotiations = world.negotiations.slice(-128).filter((negotiation) => negotiation.status === "open");
    const openPairs = new Set<string>();
    const openCounts = new Map<string, number>();
    for (const negotiation of openNegotiations) {
      const key = [...negotiation.parties].sort().join("|");
      invariant(!openPairs.has(key), `seed ${seed} week ${world.week}: duplicate open negotiation pair ${key}`);
      openPairs.add(key);
      const current = proposalById(world, negotiation.currentProposalId);
      invariant(Boolean(current), `seed ${seed} week ${world.week}: open negotiation ${negotiation.id} lost its proposal`);
      invariant(current!.status === "pending", `seed ${seed} week ${world.week}: open negotiation ${negotiation.id} has non-pending current proposal`);
      invariant(current!.round >= 1 && current!.round <= negotiation.maxRounds && negotiation.maxRounds <= 3, `seed ${seed} week ${world.week}: negotiation round escaped bounds`);
      invariant(world.week <= current!.expiresWeek, `seed ${seed} week ${world.week}: open proposal remained past expiry`);
      for (const partyId of negotiation.parties) openCounts.set(partyId, (openCounts.get(partyId) ?? 0) + 1);
    }
    for (const country of world.countries) {
      invariant((openCounts.get(country.id) ?? 0) <= diplomaticBandwidth(country), `seed ${seed} week ${world.week}: ${country.name} exceeded diplomatic bandwidth`);
    }

    for (const country of world.countries) {
      const government = country.government;
      invariant(Number.isFinite(government.legitimacy) && government.legitimacy >= 0 && government.legitimacy <= 100, `seed ${seed} week ${world.week}: ${country.name} legitimacy out of bounds`);
      invariant(Number.isFinite(government.cohesion) && government.cohesion >= 0 && government.cohesion <= 100, `seed ${seed} week ${world.week}: ${country.name} cohesion out of bounds`);
      invariant(Number.isFinite(government.dissent) && government.dissent >= 0 && government.dissent <= 100, `seed ${seed} week ${world.week}: ${country.name} dissent out of bounds`);
      invariant(Object.values(government.agenda).every((value) => Number.isFinite(value) && value >= 0 && value <= 100), `seed ${seed} week ${world.week}: ${country.name} agenda out of bounds`);
      invariant(government.objectives.length === 3, `seed ${seed} week ${world.week}: ${country.name} lost delegated objectives`);
      invariant(government.objectives.every((objective) => Number.isFinite(objective.progress) && objective.progress >= 0 && objective.progress <= 100), `seed ${seed} week ${world.week}: ${country.name} objective progress invalid`);
    }
  }

  const treatyIds = new Set<string>();
  for (const treaty of world.treaties) {
    invariant(!treatyIds.has(treaty.id), `seed ${seed}: duplicate treaty id ${treaty.id}`);
    treatyIds.add(treaty.id);
    invariant(treaty.parties.length === 2 && treaty.parties[0] !== treaty.parties[1], `seed ${seed}: invalid treaty parties`);
    invariant(treaty.parties.every((id) => world.countries.some((country) => country.id === id)), `seed ${seed}: treaty references missing country`);
    const clauseIds = new Set<string>();
    for (const clause of treaty.clauses) {
      invariant(!clauseIds.has(clause.id), `seed ${seed}: duplicate treaty clause id ${clause.id}`);
      clauseIds.add(clause.id);
      if (clause.kind === "quota") invariant(clause.usedThisWeek >= 0 && clause.usedThisWeek <= clause.maxUnitsPerWeek + 0.0001, `seed ${seed}: treaty quota exceeded`);
    }
    for (const obligation of treaty.obligations) {
      invariant(Number.isFinite(obligation.totalAmount) && obligation.totalAmount > 0, `seed ${seed}: invalid treaty obligation total`);
      invariant(obligation.paidAmount >= 0 && obligation.remainingAmount >= 0, `seed ${seed}: negative treaty obligation balance`);
      invariant(Math.abs(obligation.paidAmount + obligation.remainingAmount - obligation.totalAmount) <= 0.011, `seed ${seed}: treaty obligation does not reconcile`);
      invariant(world.countries.some((country) => country.id === obligation.payerId), `seed ${seed}: obligation payer missing`);
      invariant(world.countries.some((country) => country.id === obligation.payeeId), `seed ${seed}: obligation payee missing`);
    }
    for (const amount of Object.values(treaty.treasuryEscrow)) invariant(Number.isFinite(amount) && amount >= -0.0001, `seed ${seed}: invalid treaty escrow`);
  }
  withdrawalRequests += world.treaties.filter((treaty) => treaty.withdrawalRequestedBy !== null).length;
  withdrawnTreaties += world.treaties.filter((treaty) => treaty.status === "withdrawn").length;
  expiredAfterWithdrawalNotice += world.treaties.filter((treaty) => treaty.withdrawalRequestedBy !== null && treaty.status === "expired").length;
  invariant(world.treaties.length <= 4_001, `seed ${seed}: treaty history exceeded the theoretical negotiation pace`);

  const negotiationIds = new Set<string>();
  for (const negotiation of world.negotiations) {
    invariant(!negotiationIds.has(negotiation.id), `seed ${seed}: duplicate negotiation id ${negotiation.id}`);
    negotiationIds.add(negotiation.id);
    invariant(negotiation.parties.length === 2 && negotiation.parties[0] !== negotiation.parties[1], `seed ${seed}: invalid negotiation parties`);
    invariant(negotiation.proposalIds.length >= 1 && negotiation.proposalIds.length <= negotiation.maxRounds && negotiation.maxRounds === 3, `seed ${seed}: negotiation proposal chain invalid`);
    invariant(negotiation.proposalIds.every((id) => Boolean(proposalById(world, id))), `seed ${seed}: negotiation references missing proposal`);
    if (negotiation.status === "accepted") {
      invariant(Boolean(negotiation.outcomeTreatyId), `seed ${seed}: accepted negotiation missing treaty id`);
      invariant(world.treaties.some((treaty) => treaty.id === negotiation.outcomeTreatyId), `seed ${seed}: accepted negotiation references missing treaty`);
    }
    if (negotiation.status !== "open") invariant(negotiation.cooldownUntilWeek >= negotiation.lastActionWeek, `seed ${seed}: terminal negotiation has invalid cooldown`);
  }

  const proposalIds = new Set<string>();
  for (const proposal of world.proposals) {
    invariant(!proposalIds.has(proposal.id), `seed ${seed}: duplicate proposal id ${proposal.id}`);
    proposalIds.add(proposal.id);
    invariant(proposal.round >= 1 && proposal.round <= 3, `seed ${seed}: proposal round invalid`);
    invariant(proposal.proposerId !== proposal.recipientId, `seed ${seed}: proposal has same proposer and recipient`);
    invariant(proposal.draft.parties.includes(proposal.proposerId) && proposal.draft.parties.includes(proposal.recipientId), `seed ${seed}: proposal parties diverged from negotiation actors`);
    if (proposal.responseToProposalId) invariant(Boolean(proposalById(world, proposal.responseToProposalId)), `seed ${seed}: proposal response chain is broken`);
    invariant(proposal.evaluations.length >= 1 && proposal.evaluations.length <= 2, `seed ${seed}: proposal evaluation count invalid`);
    for (const evaluation of proposal.evaluations) {
      invariant(Number.isFinite(evaluation.totalScore) && evaluation.totalScore >= 0 && evaluation.totalScore <= 100, `seed ${seed}: cabinet score invalid`);
      invariant(Number.isFinite(evaluation.threshold) && evaluation.threshold >= 0 && evaluation.threshold <= 100, `seed ${seed}: cabinet threshold invalid`);
      invariant(evaluation.components.length === 6, `seed ${seed}: cabinet evaluation lost institutional components`);
      invariant(evaluation.components.every((component) => Number.isFinite(component.score) && component.score >= 0 && component.score <= 100 && Number.isFinite(component.weight) && component.weight > 0), `seed ${seed}: cabinet component invalid`);
    }
  }
  invariant(world.negotiations.length <= 4_000, `seed ${seed}: negotiation history exceeded two openings per quarter`);
  invariant(world.proposals.length <= 12_000, `seed ${seed}: proposal history exceeded three rounds per negotiation`);

  const memoryIds = new Set<string>();
  for (const memory of world.diplomaticMemories) {
    invariant(!memoryIds.has(memory.id), `seed ${seed}: duplicate diplomatic memory id ${memory.id}`);
    memoryIds.add(memory.id);
    invariant(world.countries.some((country) => country.id === memory.subjectId), `seed ${seed}: diplomatic memory subject missing`);
    invariant(world.countries.some((country) => country.id === memory.counterpartId), `seed ${seed}: diplomatic memory counterpart missing`);
    invariant(memory.subjectId !== memory.counterpartId, `seed ${seed}: diplomatic memory became self-referential`);
    invariant(Number.isFinite(memory.severity) && memory.severity >= 0 && memory.severity <= 100, `seed ${seed}: diplomatic memory severity invalid`);
    const salience = memorySalience(memory, world.week);
    invariant(Number.isFinite(salience) && salience >= 0 && salience <= 100, `seed ${seed}: diplomatic memory salience invalid`);
    if (memory.sourceType === "negotiation") invariant(Boolean(proposalById(world, memory.sourceId)), `seed ${seed}: negotiation memory source missing`);
    if (memory.category === "lawful_withdrawal") {
      lawfulWithdrawalMemories++;
      if (withdrawalSamples.length < 8) {
        withdrawalSamples.push({ seed, week: memory.week, subjectId: memory.subjectId, counterpartId: memory.counterpartId, sourceId: memory.sourceId });
      }
    }
  }
  invariant(
    world.diplomaticMemories.length <= world.negotiations.length + world.treaties.length * 4 + world.treatyViolations.length + 50,
    `seed ${seed}: diplomatic memory history exceeded modeled source growth`,
  );

  for (const violation of world.treatyViolations) {
    invariant(
      world.diplomaticMemories.some((memory) => memory.sourceId === violation.id && memory.category === "commitment_breached" && memory.subjectId === violation.violatorId),
      `seed ${seed}: treaty violation ${violation.id} lacks breach memory`,
    );
    if (violation.deliberate) deliberateTreatyViolations++;
  }

  for (const observer of world.countries) {
    for (const subject of world.countries) {
      if (observer.id === subject.id) continue;
      const credibility = getCredibility(world, observer.id, subject.id);
      invariant(Number.isFinite(credibility) && credibility >= 0 && credibility <= 100, `seed ${seed}: credibility out of bounds for ${observer.id}/${subject.id}`);
      maxCredibility = Math.max(maxCredibility, credibility);
    }
  }

  diplomaticMemories += world.diplomaticMemories.length;
  fulfilledFixtureObligations += fixture.treaty.obligations.filter((obligation) => obligation.status === "fulfilled").length;
  treatyViolations += world.treatyViolations.length;
  negotiationsStarted += world.negotiations.length;
  acceptedNegotiations += world.negotiations.filter((negotiation) => negotiation.status === "accepted").length;
  rejectedNegotiations += world.negotiations.filter((negotiation) => negotiation.status === "rejected").length;
  counterProposals += world.proposals.filter((proposal) => proposal.round > 1).length;
  beliefDrivenEconomicNegotiations += world.proposals.filter(
    (proposal) => proposal.round === 1 && (proposal.motive === "trade_access" || proposal.motive === "financing"),
  ).length;
  beliefDrivenEconomicNegotiationEvents += world.events.filter(
    (event) => event.kind === "diplomacy"
      && event.text.includes("Intelligence estimated")
      && (event.text.includes("opens trade-access talks") || event.text.includes("opens financing talks")),
  ).length;
  for (const proposal of world.proposals) {
    if (proposal.motive !== "financing") continue;
    const loan = proposal.draft.clauses.find((clause) => clause.kind === "loan");
    if (!loan || loan.kind !== "loan") continue;
    beliefDrivenLoanEvaluations += proposal.evaluations.filter(
      (evaluation) => evaluation.countryId === loan.creditorId,
    ).length;
  }
  beliefDrivenLoanEvaluationEvents += world.events.filter(
    (event) => event.kind === "diplomacy"
      && (event.text.includes("Creditor intelligence assessed")
        || event.text.includes("applies maximum repayment-risk stress")),
  ).length;
  if (world.negotiations.length > 0) worldsWithNegotiations++;
  if (world.negotiations.some((negotiation) => negotiation.status === "accepted")) worldsWithAcceptedNegotiations++;
  const worldSecretNegotiations = world.negotiations.filter((negotiation) => negotiation.visibility === "secret");
  const worldSecretTreaties = world.treaties.filter((treaty) => treaty.visibility === "secret");
  secretNegotiations += worldSecretNegotiations.length;
  secretTreaties += worldSecretTreaties.length;
  if (worldSecretTreaties.length > 0) worldsWithSecretTreaties++;
  for (const treaty of worldSecretTreaties) {
    invariant(treaty.clauses.every((clause) => clause.kind === "non_aggression"), `seed ${seed}: secret treaty ${treaty.id} contains non-security clauses`);
    const outsiders = world.countries.filter((country) => !treaty.parties.includes(country.id));
    const exactTreatyId = new RegExp(`${treaty.id}(?!\\d)`);
    const matchingEvents = world.events.filter((event) => event.text.includes(treaty.title) || exactTreatyId.test(event.text));
    secretTreatyHistoryEvents += matchingEvents.length;
    for (const event of matchingEvents) {
      const treatyDiscoveryEvent = event.text.includes(" intelligence uncovers ")
        && event.text.includes(" through active reconnaissance of ");
      const negotiationDiscoveryEvent = event.text.includes(" intelligence detects confidential ")
        && event.text.includes(" talks between ")
        && event.text.includes(" through active reconnaissance of ");
      const renderedOutsiders = outsiders.filter((outsider) => eventTextForObserver(event, outsider.id) !== null);
      if (!treatyDiscoveryEvent && !negotiationDiscoveryEvent) {
        invariant(renderedOutsiders.length === 0, `seed ${seed}: secret treaty ${treaty.id} lifecycle leaked outside its parties`);
        continue;
      }

      invariant(renderedOutsiders.length === 1, `seed ${seed}: secret diplomacy discovery for ${treaty.id} was not limited to exactly one outsider`);
      const discoverer = renderedOutsiders[0]!;
      invariant(event.audienceCountryIds?.length === 1 && event.audienceCountryIds[0] === discoverer.id, `seed ${seed}: secret diplomacy discovery for ${treaty.id} audience drifted`);

      if (treatyDiscoveryEvent) {
        const discovererKnowledge = Object.values(world.intelligence.secretTreatiesByObserver[discoverer.id] ?? {});
        const eventNamesExactTreatyId = exactTreatyId.test(event.text);
        const hasSupportingDiscovery = eventNamesExactTreatyId
          ? discovererKnowledge.some((intel) => intel.treatyId === treaty.id)
          : discovererKnowledge.some((intel) => intel.title === treaty.title);
        invariant(hasSupportingDiscovery, `seed ${seed}: ${discoverer.id} rendered secret treaty discovery without matching stored intelligence`);
      } else {
        const negotiationKnowledge = Object.values(world.intelligence.secretNegotiationsByObserver[discoverer.id] ?? {});
        invariant(
          negotiationKnowledge.some((intel) => intel.title === treaty.title),
          `seed ${seed}: ${discoverer.id} rendered precursor secret-talk discovery without matching stored intelligence`,
        );
      }
    }
  }
  maxNegotiationsPerWorld = Math.max(maxNegotiationsPerWorld, world.negotiations.length);
  maxProposalsPerWorld = Math.max(maxProposalsPerWorld, world.proposals.length);
  maxTreatiesPerWorld = Math.max(maxTreatiesPerWorld, world.treaties.length);

  let floorCountries = 0;
  for (const country of world.countries) {
    const numbers = [
      country.population,
      country.treasury,
      country.military,
      country.militaryCapacity,
      country.readiness,
      country.stability,
      ...Object.values(country.resources),
      ...Object.values(country.production),
      ...Object.values(country.needs),
    ];
    invariant(numbers.every(Number.isFinite), `seed ${seed}: ${country.name} has non-finite state`);
    invariant(country.readiness >= 0 && country.readiness <= 100, `seed ${seed}: ${country.name} readiness out of bounds`);
    invariant(country.stability >= 0 && country.stability <= 100, `seed ${seed}: ${country.name} stability out of bounds`);
    invariant(country.military >= 3, `seed ${seed}: ${country.name} military below floor`);
    invariant(country.military <= country.militaryCapacity + 0.0001, `seed ${seed}: ${country.name} military exceeds capacity`);
    invariant(country.treasury >= -country.population * 5 - 0.0001, `seed ${seed}: ${country.name} treasury below debt floor`);
    invariant(world.geography.cells.filter((cell) => cell.ownerId === country.id).length >= 4, `seed ${seed}: ${country.name} fell below territorial floor`);
    invariant(Object.keys(country.government.ministries).length === 5, `seed ${seed}: ${country.name} ministry count changed`);
    for (const ministry of Object.values(country.government.ministries)) {
      invariant(ministry.competence >= 0 && ministry.competence <= 100, `seed ${seed}: ${country.name} ministry competence invalid`);
      invariant(ministry.influence >= 0 && ministry.influence <= 100, `seed ${seed}: ${country.name} ministry influence invalid`);
      invariant(ministry.loyalty >= 0 && ministry.loyalty <= 100, `seed ${seed}: ${country.name} ministry loyalty invalid`);
    }

    if (country.military <= 3.0001) floorCountries++;
    finalReadiness.push(country.readiness);
    finalTreasuries.push(country.treasury);
    const treasuryPerCapita = country.treasury / Math.max(1, country.population);
    finalTreasuryPerCapita.push(treasuryPerCapita);
    if (country.treasury > maxTreasuryCountry.treasury) {
      maxTreasuryCountry = {
        seed,
        country: country.name,
        treasury: country.treasury,
        population: country.population,
        treasuryPerCapita,
      };
    }
    finalLegitimacy.push(country.government.legitimacy);
    finalCohesion.push(country.government.cohesion);
    finalDissent.push(country.government.dissent);
  }

  successfulBeliefDrivenTradeEvents += world.events.filter((event) => event.kind === "trade").length;
  reconnaissanceEvents += world.events.filter(
    (event) => event.kind === "world" && event.text.startsWith("Active reconnaissance retasked"),
  ).length;
  const discoveryEvents = world.events.filter((event) => event.text.includes(" intelligence uncovers ") && event.text.includes(" through active reconnaissance of "));
  secretTreatyDiscoveryEvents += discoveryEvents.length;
  for (const event of discoveryEvents) {
    invariant(event.audienceCountryIds?.length === 1, `seed ${seed}: secret-treaty discovery event lost private observer audience`);
    invariant(event.publicText === null, `seed ${seed}: secret-treaty discovery event gained public fallback text`);
    const observerId = event.audienceCountryIds![0]!;
    for (const country of world.countries) {
      if (country.id === observerId) continue;
      invariant(eventTextForObserver(event, country.id) === null, `seed ${seed}: secret-treaty discovery event leaked to ${country.id}`);
    }
  }
  const negotiationDiscoveryEvents = world.events.filter((event) =>
    event.text.includes(" intelligence detects confidential ")
    && event.text.includes(" talks between ")
    && event.text.includes(" through active reconnaissance of "),
  );
  secretNegotiationDiscoveryEvents += negotiationDiscoveryEvents.length;
  for (const event of negotiationDiscoveryEvents) {
    invariant(event.audienceCountryIds?.length === 1, `seed ${seed}: secret-negotiation discovery event lost private observer audience`);
    invariant(event.publicText === null, `seed ${seed}: secret-negotiation discovery event gained public fallback text`);
    const observerId = event.audienceCountryIds![0]!;
    for (const country of world.countries) {
      if (country.id === observerId) continue;
      invariant(eventTextForObserver(event, country.id) === null, `seed ${seed}: secret-negotiation discovery event leaked to ${country.id}`);
    }
  }

  for (const event of world.events) {
    if (!event.audienceCountryIds) continue;
    restrictedHistoryEvents++;
    invariant(
      event.audienceCountryIds.every((countryId) => world.countries.some((country) => country.id === countryId)),
      `seed ${seed}: restricted event references an unknown audience country`,
    );
    if (event.publicText !== undefined && event.publicText !== null) {
      sanitizedHistoryEvents++;
      invariant(
        !/Buyer intelligence estimated|intelligence assessed .*confidence|Intelligence estimated .*confidence|Creditor intelligence assessed|cabinet .*utility .*threshold|largest treasury|Active reconnaissance retasked/i.test(event.publicText),
        `seed ${seed}: private intelligence provenance leaked into sanitized observer history`,
      );
    }
    if (/Buyer intelligence estimated|intelligence assessed .*confidence|Intelligence estimated .*confidence|Creditor intelligence assessed|cabinet .*utility .*threshold|largest treasury|Active reconnaissance retasked/i.test(event.text)) {
      privateProvenanceEvents++;
    }
  }

  invariant(Object.keys(world.intelligence.byObserver).length === world.countries.length, `seed ${seed}: intelligence observer count diverged`);
  invariant(Object.keys(world.intelligence.deceptionByCountry).length === world.countries.length, `seed ${seed}: military deception posture count diverged`);
  for (const country of world.countries) {
    const posture = world.intelligence.deceptionByCountry[country.id];
    invariant(Boolean(posture), `seed ${seed}: ${country.name} lost military deception posture`);
    invariant(["none", "conceal", "exaggerate"].includes(posture!.mode), `seed ${seed}: ${country.name} deception mode invalid`);
    invariant(Number.isFinite(posture!.strengthPct) && posture!.strengthPct >= 0 && posture!.strengthPct <= 18, `seed ${seed}: ${country.name} deception strength invalid`);
    invariant(posture!.updatedWeek === world.week, `seed ${seed}: ${country.name} deception posture is stale`);
    if (posture!.mode === "conceal") concealmentPostures++;
    if (posture!.mode === "exaggerate") exaggerationPostures++;
  }
  for (const observer of world.countries) {
    const discoveredNegotiations = getSecretNegotiationIntelligence(world, observer.id);
    if (discoveredNegotiations.length > 0) observersWithSecretNegotiationDiscoveries++;
    for (const intel of discoveredNegotiations) {
      discoveredSecretNegotiationIntel++;
      invariant(!intel.parties.includes(observer.id), `seed ${seed}: ${observer.name} stored own secret negotiation as foreign discovery`);
      const negotiation = world.negotiations.find((candidate) => candidate.id === intel.negotiationId);
      invariant(Boolean(negotiation), `seed ${seed}: discovered secret negotiation ${intel.negotiationId} no longer exists in authoritative ledger`);
      invariant(negotiation!.visibility === "secret", `seed ${seed}: discovered negotiation ${intel.negotiationId} points to public talks`);
      invariant(intel.motive === negotiation!.motive, `seed ${seed}: discovered secret negotiation motive drifted`);
      invariant(intel.parties.length === 2 && intel.parties.every((partyId) => negotiation!.parties.includes(partyId)), `seed ${seed}: discovered secret negotiation parties drifted`);
      const proposalTitles = negotiation!.proposalIds
        .map((proposalId) => proposalById(world, proposalId)?.draft.title)
        .filter((title): title is string => Boolean(title));
      invariant(proposalTitles.includes(intel.title), `seed ${seed}: discovered secret negotiation title lacks authoritative proposal support`);
      invariant(intel.discoveredWeek >= 0 && intel.discoveredWeek <= intel.lastConfirmedWeek && intel.lastConfirmedWeek <= world.week, `seed ${seed}: discovered secret negotiation timing is invalid`);
      const confidence = effectiveSecretNegotiationConfidence(intel, world.week);
      invariant(Number.isFinite(confidence) && confidence >= 5 && confidence <= 100, `seed ${seed}: discovered secret negotiation confidence is invalid`);
      const age = world.week - intel.lastConfirmedWeek;
      if (age > 13) staleSecretNegotiationIntel++;
      if (intel.status !== negotiation!.status) secretNegotiationStatusDivergences++;
    }

    const discoveredTreaties = getSecretTreatyIntelligence(world, observer.id);
    if (discoveredTreaties.length > 0) observersWithSecretDiscoveries++;
    for (const intel of discoveredTreaties) {
      discoveredSecretTreatyIntel++;
      invariant(!intel.parties.includes(observer.id), `seed ${seed}: ${observer.name} stored own secret treaty as foreign discovery`);
      const treaty = world.treaties.find((candidate) => candidate.id === intel.treatyId);
      invariant(Boolean(treaty), `seed ${seed}: discovered secret treaty ${intel.treatyId} no longer exists in authoritative ledger`);
      invariant(treaty!.visibility === "secret", `seed ${seed}: discovered intelligence ${intel.treatyId} points to a public treaty`);
      invariant(intel.title === treaty!.title, `seed ${seed}: discovered secret treaty title drifted`);
      invariant(intel.parties.length === 2 && intel.parties.every((partyId) => treaty!.parties.includes(partyId)), `seed ${seed}: discovered secret treaty parties drifted`);
      invariant(intel.discoveredWeek >= 0 && intel.discoveredWeek <= intel.lastConfirmedWeek && intel.lastConfirmedWeek <= world.week, `seed ${seed}: discovered secret treaty timing is invalid`);
      const confidence = effectiveSecretTreatyConfidence(intel, world.week);
      invariant(Number.isFinite(confidence) && confidence >= 5 && confidence <= 100, `seed ${seed}: discovered secret treaty confidence is invalid`);
      const age = world.week - intel.lastConfirmedWeek;
      if (age > 13) staleSecretTreatyIntel++;
      if (intel.status !== treaty!.status) secretTreatyStatusDivergences++;
    }

    const profiles = world.intelligence.byObserver[observer.id];
    invariant(Boolean(profiles), `seed ${seed}: ${observer.name} lost intelligence state`);
    invariant(Object.keys(profiles!).length === world.countries.length - 1, `seed ${seed}: ${observer.name} intelligence profile count diverged`);
    invariant(!profiles![observer.id], `seed ${seed}: ${observer.name} received a self-intelligence profile`);
    const reconAssignment = world.intelligence.reconByObserver[observer.id];
    invariant(Boolean(reconAssignment), `seed ${seed}: ${observer.name} lost active reconnaissance assignment`);
    invariant(reconAssignment!.subjectId !== observer.id, `seed ${seed}: ${observer.name} targeted itself for reconnaissance`);
    invariant(reconAssignment!.assignedWeek === world.week, `seed ${seed}: ${observer.name} reconnaissance assignment is stale`);
    activeReconAssignments++;
    const assignedProfile = profiles![reconAssignment!.subjectId];
    invariant(Boolean(assignedProfile), `seed ${seed}: ${observer.name} reconnaissance target lacks an intelligence profile`);
    invariant(assignedProfile!.collectionMethod === "recon", `seed ${seed}: ${observer.name} active reconnaissance did not produce a recon profile`);
    invariant(assignedProfile!.estimates.population.observedWeek === reconAssignment!.assignedWeek, `seed ${seed}: ${observer.name} recon profile was not refreshed on assignment week`);
    currentReconProfiles++;
    for (const [subjectId, profile] of Object.entries(profiles!)) {
      invariant(world.countries.some((country) => country.id === subjectId), `seed ${seed}: intelligence subject ${subjectId} missing`);
      invariant(profile.subjectId === subjectId, `seed ${seed}: intelligence subject key mismatch ${subjectId}`);
      intelligenceProfiles++;
      const age = world.week - profile.estimates.population.observedWeek;
      invariant(age >= 0, `seed ${seed}: future-dated intelligence observation`);
      if (age > 13) staleIntelligenceProfiles++;
      const subject = world.countries.find((country) => country.id === subjectId)!;
      const deceptionPosture = world.intelligence.deceptionByCountry[subjectId]!;
      if (
        deceptionPosture.mode !== "none"
        && profile.estimates.military.observedWeek === world.week
      ) {
        currentDeceptionAffectedProfiles++;
        if (profile.collectionMethod === "recon") currentReconAgainstDeception++;
      }
      if (Math.abs(profile.estimates.military.value - subject.military) > 0.05) imperfectMilitaryEstimates++;
      if (Math.abs(profile.estimates.foodExportable.value - getSellerExportableSurplus(subject, "food")) > 0.05) {
        imperfectEconomicAvailabilityEstimates++;
      }
      for (const economicEstimate of [
        profile.estimates.foodExportable,
        profile.estimates.energyExportable,
        profile.estimates.metalsExportable,
        profile.estimates.goodsExportable,
      ]) {
        invariant(economicEstimate.low >= 0, `seed ${seed}: negative exportable-supply intelligence`);
      }
      for (const estimate of Object.values(profile.estimates)) {
        invariant([estimate.value, estimate.low, estimate.high, estimate.confidence, estimate.observedWeek].every(Number.isFinite), `seed ${seed}: non-finite intelligence estimate`);
        invariant(estimate.low <= estimate.value && estimate.value <= estimate.high, `seed ${seed}: intelligence interval does not contain estimate`);
        const confidenceCeiling = profile.collectionMethod === "recon" ? 98 : 92;
        invariant(estimate.confidence >= 20 && estimate.confidence <= confidenceCeiling, `seed ${seed}: intelligence confidence out of bounds`);
        invariant(estimate.observedWeek <= world.week, `seed ${seed}: intelligence observation lies in the future`);
        intelligenceConfidence.push(estimate.confidence);
      }
    }
  }

  const worldTreasury = world.countries.reduce((sum, country) => sum + country.treasury, 0);
  const worldPopulation = world.countries.reduce((sum, country) => sum + country.population, 0);
  finalWorldTreasuryPerCapita.push(worldTreasury / Math.max(1, worldPopulation));

  for (const city of world.geography.cities) {
    const cell = world.geography.cells.find((candidate) => candidate.id === city.cellId);
    invariant(Boolean(cell?.land), `seed ${seed}: ${city.name} left land`);
    invariant(cell?.ownerId === city.countryId, `seed ${seed}: ${city.name} ownership diverged from its cell`);
    invariant(Number.isFinite(city.population) && city.population >= 0.35, `seed ${seed}: ${city.name} population invalid`);
    invariant(Number.isFinite(city.industry) && city.industry >= 0.5 && city.industry <= 12, `seed ${seed}: ${city.name} industry invalid`);
    finalCityPopulations.push(city.population);
  }

  for (const country of world.countries) {
    for (const neighbor of world.geography.adjacency[country.id] ?? []) {
      invariant((world.geography.adjacency[neighbor] ?? []).includes(country.id), `seed ${seed}: asymmetric border ${country.id}/${neighbor}`);
    }
  }
  for (const route of world.geography.routes.filter((route) => route.mode === "land")) {
    invariant((world.geography.adjacency[route.a] ?? []).includes(route.b), `seed ${seed}: stale land route ${route.id}`);
  }

  upgradedRoutes += world.geography.routes.filter((route) => route.level > 1).length;
  finalChokepoints += world.geography.routes.filter((route) => route.chokepoint).length;

  for (let i = 0; i < world.countries.length; i++) {
    for (let j = i + 1; j < world.countries.length; j++) {
      const a = world.countries[i]!;
      const b = world.countries[j]!;
      finalTension.push(a.relations[b.id]!.tension);
    }
  }

  totalFloorCountries += floorCountries;
  if (floorCountries === world.countries.length) worldsAtMilitaryFloor++;

  if ((seedIndex + 1) % 20 === 0) {
    console.log(`stress progress: ${seedIndex + 1}/${SEEDS.length} worlds complete`);
  }
}

const avgReadiness = average(finalReadiness);
const avgTension = average(finalTension);
const maxTreasury = Math.max(...finalTreasuries);
const maxTreasuryPerCapita = Math.max(...finalTreasuryPerCapita);
const maxWorldTreasuryPerCapita = Math.max(...finalWorldTreasuryPerCapita);
const avgWorldTreasuryPerCapita = average(finalWorldTreasuryPerCapita);
const maxCityPopulation = Math.max(...finalCityPopulations);
const avgLegitimacy = average(finalLegitimacy);
const avgCohesion = average(finalCohesion);
const avgDissent = average(finalDissent);
const summary = {
  worlds: SEEDS.length,
  yearsPerWorld: YEARS,
  simulatedYears: SEEDS.length * YEARS,
  worldsAtMilitaryFloor,
  totalFloorCountries,
  upgradedRoutes,
  finalChokepoints,
  treatyFixtures,
  fulfilledFixtureObligations,
  treatyViolations,
  deliberateTreatyViolations,
  diplomaticMemories,
  lawfulWithdrawalMemories,
  withdrawalRequests,
  withdrawnTreaties,
  expiredAfterWithdrawalNotice,
  withdrawalReviewOpportunities,
  eligibleWithdrawalReviews,
  withdrawalChanceMass,
  maxWithdrawalChance,
  withdrawalSamples,
  minCredibility,
  maxCredibility,
  negotiationsStarted,
  acceptedNegotiations,
  rejectedNegotiations,
  counterProposals,
  beliefDrivenEconomicNegotiations,
  beliefDrivenEconomicNegotiationEvents,
  beliefDrivenLoanEvaluations,
  beliefDrivenLoanEvaluationEvents,
  worldsWithNegotiations,
  worldsWithAcceptedNegotiations,
  maxNegotiationsPerWorld,
  maxProposalsPerWorld,
  maxTreatiesPerWorld,
  avgReadiness,
  avgTension,
  maxTreasury,
  maxTreasuryCountry,
  maxTreasuryPerCapita,
  maxWorldTreasuryPerCapita,
  avgWorldTreasuryPerCapita,
  maxCityPopulation,
  avgLegitimacy,
  avgCohesion,
  avgDissent,
  intelligenceProfiles,
  staleIntelligenceProfiles,
  activeReconAssignments,
  currentReconProfiles,
  reconnaissanceEvents,
  restrictedHistoryEvents,
  sanitizedHistoryEvents,
  privateProvenanceEvents,
  secretTreaties,
  secretNegotiations,
  worldsWithSecretTreaties,
  secretTreatyHistoryEvents,
  discoveredSecretTreatyIntel,
  observersWithSecretDiscoveries,
  staleSecretTreatyIntel,
  secretTreatyStatusDivergences,
  secretTreatyDiscoveryEvents,
  discoveredSecretNegotiationIntel,
  observersWithSecretNegotiationDiscoveries,
  staleSecretNegotiationIntel,
  secretNegotiationStatusDivergences,
  secretNegotiationDiscoveryEvents,
  concealmentPostures,
  exaggerationPostures,
  currentDeceptionAffectedProfiles,
  currentReconAgainstDeception,
  imperfectMilitaryEstimates,
  imperfectEconomicAvailabilityEstimates,
  successfulBeliefDrivenTradeEvents,
  avgIntelligenceConfidence: average(intelligenceConfidence),
  beliefDrivenWarStarts,
  warsUnderestimatingDefenderPower,
  warsOverestimatingDefenderPower,
  maxWarIntelligenceAge,
  avgWarIntelligenceConfidence: warIntelligenceConfidence.length ? average(warIntelligenceConfidence) : 0,
  warDecisionSamples,
};

console.log(JSON.stringify(summary));

invariant(finalReadiness.length === SEEDS.length * 8, "stress gate did not evaluate all countries");
invariant(treatyFixtures === SEEDS.length, "treaty fixture did not register in every stress world");
invariant(fulfilledFixtureObligations >= SEEDS.length * 0.9, `only ${fulfilledFixtureObligations} fixture obligations fulfilled`);
invariant(worldsWithNegotiations >= SEEDS.length * 0.9, `only ${worldsWithNegotiations} worlds generated autonomous diplomacy`);
invariant(worldsWithAcceptedNegotiations >= SEEDS.length * 0.7, `only ${worldsWithAcceptedNegotiations} worlds signed autonomous agreements`);
invariant(acceptedNegotiations > SEEDS.length, `only ${acceptedNegotiations} autonomous negotiations reached agreement`);
invariant(rejectedNegotiations >= negotiationsStarted * 0.01, `only ${rejectedNegotiations}/${negotiationsStarted} autonomous negotiations were rejected; cabinet bargaining is too agreeable`);
invariant(counterProposals > 0, "no autonomous counterproposal occurred in the stress worlds");
invariant(beliefDrivenEconomicNegotiations > SEEDS.length, "belief-driven economic negotiation initiation stopped occurring");
invariant(beliefDrivenEconomicNegotiationEvents > SEEDS.length, "belief-driven economic negotiation history lost its intelligence provenance");
invariant(beliefDrivenLoanEvaluations > SEEDS.length, "creditor cabinets stopped evaluating financing proposals from subjective debtor intelligence");
invariant(beliefDrivenLoanEvaluationEvents > SEEDS.length, "creditor loan-intelligence provenance stopped reaching world history");
invariant(diplomaticMemories > 0, "no diplomatic memories were retained");
invariant(deliberateTreatyViolations > 0, "no deliberate treaty breach occurred in autonomous stress worlds");
invariant(deliberateTreatyViolations < acceptedNegotiations * 0.00025, `${deliberateTreatyViolations} deliberate treaty breaches are too frequent relative to ${acceptedNegotiations} accepted agreements`);
// Phase 4 calibration established 5 as a robust reachability floor. Keep the
// floor independent of one exact deterministic event count so later causal
// phases can change histories without weakening the near-unreachability gate.
invariant(lawfulWithdrawalMemories >= 5, `only ${lawfulWithdrawalMemories} autonomous lawful treaty withdrawals occurred in the stress worlds`);
invariant(lawfulWithdrawalMemories < acceptedNegotiations * 0.001, `${lawfulWithdrawalMemories} lawful withdrawals are too frequent relative to ${acceptedNegotiations} accepted agreements`);
invariant(withdrawalRequests >= withdrawnTreaties, "withdrawn treaty count exceeded withdrawal requests");
invariant(withdrawnTreaties === lawfulWithdrawalMemories, `withdrawn treaty count ${withdrawnTreaties} diverged from lawful-withdrawal memories ${lawfulWithdrawalMemories}`);
invariant(minCredibility < 45, `minimum credibility ${minCredibility} never reflected reputational damage`);
invariant(maxCredibility > 55, `maximum credibility ${maxCredibility} never reflected honored commitments`);
invariant(worldsAtMilitaryFloor === 0, `${worldsAtMilitaryFloor} worlds collapsed universally to the military floor`);
invariant(totalFloorCountries < SEEDS.length * 2, `${totalFloorCountries} countries ended at the military floor`);
invariant(upgradedRoutes > 0, "no infrastructure upgrades survived to the end of the stress worlds");
invariant(finalChokepoints > 0, "all maritime chokepoints disappeared");
invariant(avgReadiness > 35, `average readiness ${avgReadiness} is too low`);
invariant(avgTension < 70, `average tension ${avgTension} is too high`);
// Absolute treasury is not scale-invariant because migration can concentrate
// population in a durable, peaceful state. The global per-capita ratio is the
// stronger runaway-money check: trade, loans and reparations are transfers,
// while taxes are countered by spending and population-scaled reserve investment.
invariant(maxWorldTreasuryPerCapita < 32, `maximum world treasury/population ratio ${maxWorldTreasuryPerCapita} exceeds the fiscal stability ceiling`);
invariant(maxCityPopulation < 200, `maximum city population ${maxCityPopulation} is implausibly high`);
invariant(avgLegitimacy > 18, `average legitimacy ${avgLegitimacy} collapsed`);
invariant(avgCohesion > 18, `average cabinet cohesion ${avgCohesion} collapsed`);
invariant(avgCohesion < 90, `average cabinet cohesion ${avgCohesion} saturated unrealistically`);
invariant(avgDissent < 88, `average cabinet dissent ${avgDissent} is too high`);
invariant(intelligenceProfiles === SEEDS.length * 8 * 7, `intelligence profile count ${intelligenceProfiles} did not cover every foreign pair`);
invariant(activeReconAssignments === SEEDS.length * 8, `active reconnaissance assignment count ${activeReconAssignments} did not cover every observer`);
invariant(currentReconProfiles === SEEDS.length * 8, `current reconnaissance profile count ${currentReconProfiles} did not cover every observer`);
invariant(reconnaissanceEvents > SEEDS.length, "active reconnaissance retasking stopped reaching world history");
invariant(restrictedHistoryEvents > SEEDS.length, "observer-limited history never became materially active");
invariant(sanitizedHistoryEvents > SEEDS.length, "restricted history stopped producing sanitized observer narratives");
invariant(privateProvenanceEvents > SEEDS.length, "authoritative history stopped retaining private causal provenance");
invariant(secretNegotiations > SEEDS.length, "secret security negotiations never became materially reachable");
invariant(secretTreaties > SEEDS.length, "secret non-aggression agreements never became materially reachable");
invariant(worldsWithSecretTreaties >= SEEDS.length * 0.5, `only ${worldsWithSecretTreaties} stress worlds produced secret agreements`);
invariant(secretTreatyHistoryEvents > SEEDS.length, "secret treaty lifecycle never reached authoritative history");
invariant(discoveredSecretTreatyIntel > SEEDS.length, "active reconnaissance never built material secret-treaty knowledge");
invariant(observersWithSecretDiscoveries > SEEDS.length, "secret-treaty discovery remained isolated to too few observer-worlds");
invariant(secretTreatyDiscoveryEvents > SEEDS.length, "secret-treaty discoveries stopped reaching private observer history");
invariant(staleSecretTreatyIntel > 0, "secret-treaty intelligence never became stale");
invariant(secretTreatyStatusDivergences > 0, "secret-treaty snapshots never diverged from live truth; observer belief may be reading authoritative status");
invariant(discoveredSecretNegotiationIntel > SEEDS.length, "active reconnaissance never built material secret-negotiation knowledge");
invariant(observersWithSecretNegotiationDiscoveries > SEEDS.length, "secret-negotiation discovery remained isolated to too few observer-worlds");
invariant(secretNegotiationDiscoveryEvents > SEEDS.length, "secret-negotiation discoveries stopped reaching private observer history");
invariant(staleSecretNegotiationIntel > 0, "secret-negotiation intelligence never became stale");
invariant(secretNegotiationStatusDivergences > 0, "secret-negotiation snapshots never diverged from live truth; observer belief may be reading authoritative status");
invariant(concealmentPostures > 0, "military concealment never appeared in final stress states");
invariant(exaggerationPostures > 0, "military exaggeration never appeared in final stress states");
invariant(currentDeceptionAffectedProfiles > SEEDS.length, "military deception stopped affecting current intelligence collection");
invariant(currentReconAgainstDeception > 0, "active reconnaissance never encountered a deceptive military posture");
invariant(staleIntelligenceProfiles > 0, "intelligence never became stale");
invariant(imperfectMilitaryEstimates > intelligenceProfiles * 0.5, "foreign military intelligence became implausibly omniscient");
invariant(imperfectEconomicAvailabilityEstimates > intelligenceProfiles * 0.5, "foreign exportable-supply intelligence became implausibly omniscient");
invariant(successfulBeliefDrivenTradeEvents > SEEDS.length, "belief-driven trade selection stopped producing successful trade");
invariant(beliefDrivenWarStarts > 0, "no autonomous war was authorized from subjective intelligence");
invariant(warsUnderestimatingDefenderPower > 0, "no autonomous war began after underestimating defender power");
invariant(warsOverestimatingDefenderPower > 0, "no autonomous war began after overestimating defender power");
