import type {
  CabinetEvaluation,
  Country,
  Ministry,
  MinistryKind,
  Negotiation,
  NegotiationMotive,
  PolicyDomain,
  Proposal,
  ProposalScoreComponent,
  TreatyClauseDraft,
  TreatyDraft,
  WorldState,
} from "../model/types";
import { registerTreaty } from "./treaties";
import { validateTreatyDraftInput } from "./treaty-input";

export type NegotiationRng = { next(): number };

const RESPONSE_DELAY_WEEKS = 1;
const PROPOSAL_LIFETIME_WEEKS = 12;
const NEGOTIATED_EFFECTIVE_DELAY_WEEKS = 8;
const NEGOTIATION_COOLDOWN_WEEKS = 39;
const ACCEPTED_COOLDOWN_WEEKS = 78;
const MAX_ROUNDS = 3;
const INITIATION_INTERVAL_WEEKS = 13;
const MAX_NEW_NEGOTIATIONS_PER_CYCLE = 2;
// With eight countries and bandwidth capped at three, at most twelve talks can
// be open at once. A 128-item tail safely covers every agreement that can still
// be open or inside the longest (78-week) cooldown while preserving full history.
const OPERATIONAL_NEGOTIATION_WINDOW = 128;

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function countryById(world: WorldState, id: string) {
  return world.countries.find((country) => country.id === id);
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function atWar(world: WorldState, a: string, b: string) {
  return world.wars.some((war) => pairKey(war.a, war.b) === pairKey(a, b));
}

function hasDirectRoute(world: WorldState, a: string, b: string) {
  return world.geography.routes.some((route) => pairKey(route.a, route.b) === pairKey(a, b));
}

function operationalNegotiations(world: WorldState) {
  return world.negotiations.length <= OPERATIONAL_NEGOTIATION_WINDOW
    ? world.negotiations
    : world.negotiations.slice(-OPERATIONAL_NEGOTIATION_WINDOW);
}

export function ensureNegotiationState(world: WorldState) {
  world.nextNegotiationId ??= 1;
  world.nextProposalId ??= 1;
  world.negotiations ??= [];
  world.proposals ??= [];
}

export function diplomaticBandwidth(country: Country) {
  const foreign = country.government.ministries.foreign;
  const engagement = country.government.agenda.diplomaticEngagement;
  return 1 + (engagement >= 58 ? 1 : 0) + (engagement >= 76 && foreign.competence >= 68 ? 1 : 0);
}

function domainUtilities(world: WorldState, country: Country, draft: TreatyDraft) {
  const utilities: Record<PolicyDomain, number> = {
    economy: 50,
    trade: 50,
    diplomacy: 50,
    defense: 50,
    stability: 50,
  };
  const relation = country.relations[draft.parties.find((id) => id !== country.id) ?? ""];
  const tension = relation?.tension ?? 50;
  const trust = relation?.trust ?? 35;

  const add = (domain: PolicyDomain, amount: number) => {
    utilities[domain] = clamp(utilities[domain] + amount);
  };

  for (const clause of draft.clauses) {
    if (clause.kind === "preferential_trade") {
      const involved = clause.grantorId === country.id || clause.beneficiaryId === country.id;
      if (!involved) continue;
      add("trade", 8 + clause.discountPct * 0.35);
      add("economy", 3 + clause.discountPct * 0.12);
      add("diplomacy", 3);
    } else if (clause.kind === "tariff") {
      if (clause.importerId === country.id) {
        add("economy", 3 + clause.ratePct * 0.05);
        add("stability", 2);
        add("trade", -4 - clause.ratePct * 0.09);
      } else if (clause.exporterId === country.id) {
        add("trade", -7 - clause.ratePct * 0.12);
        add("economy", -4 - clause.ratePct * 0.06);
      }
    } else if (clause.kind === "quota") {
      if (clause.importerId === country.id) {
        add("trade", 3);
        add("stability", 1);
      } else if (clause.exporterId === country.id) {
        add("trade", -5);
        add("economy", -3);
      }
    } else if (clause.kind === "non_aggression") {
      add("diplomacy", 7 + tension * 0.10 + trust * 0.025);
      add("stability", 5 + tension * 0.07);
      add("defense", 5 + tension * 0.08 - country.policy.expansionism * 0.08);
    } else if (clause.kind === "sanction") {
      if (clause.imposerId === country.id) {
        add("defense", 4 + tension * 0.08);
        add("diplomacy", tension > 60 ? 3 : -5);
        add("trade", -7);
      } else if (clause.targetId === country.id) {
        add("trade", -22);
        add("economy", -16);
        add("diplomacy", -15);
        add("stability", -8);
      }
    } else if (clause.kind === "loan") {
      if (clause.debtorId === country.id) {
        const fiscalNeed = clamp((country.population * 5 - country.treasury) / Math.max(1, country.population * 5) * 100);
        add("economy", 12 + fiscalNeed * 0.12);
        add("stability", 7 + fiscalNeed * 0.06);
        add("diplomacy", 4);
      } else if (clause.creditorId === country.id) {
        const debtor = countryById(world, clause.debtorId);
        const debtorRelation = country.relations[clause.debtorId];
        const reserve = Math.max(1, country.population * 6);
        const liquidityCost = clause.principal / reserve * 100;
        const debtorStress = debtor ? clamp(-debtor.treasury / Math.max(1, debtor.population * 5) * 100) : 100;
        add("economy", 4 + (debtorRelation?.trust ?? 25) * 0.05 - liquidityCost * 0.22 - debtorStress * 0.10);
        add("diplomacy", 7 + (debtorRelation?.trust ?? 25) * 0.04);
        add("stability", -liquidityCost * 0.06);
      }
    } else if (clause.kind === "reparations") {
      if (clause.payeeId === country.id) {
        add("economy", 18);
        add("stability", 6);
      } else if (clause.payerId === country.id) {
        add("economy", -22);
        add("stability", -10);
        add("diplomacy", -5);
      }
    }
  }

  return utilities;
}

const MINISTRY_DOMAIN_WEIGHTS: Record<MinistryKind, Partial<Record<PolicyDomain, number>>> = {
  finance: { economy: 0.55, stability: 0.25, trade: 0.12, defense: 0.08 },
  trade: { trade: 0.62, economy: 0.23, diplomacy: 0.15 },
  foreign: { diplomacy: 0.58, defense: 0.15, trade: 0.15, stability: 0.12 },
  defense: { defense: 0.62, stability: 0.20, diplomacy: 0.18 },
  interior: { stability: 0.62, economy: 0.20, defense: 0.18 },
};

function ministryScore(ministry: Ministry, utilities: Record<PolicyDomain, number>) {
  const weights = MINISTRY_DOMAIN_WEIGHTS[ministry.kind];
  let score = 0;
  let totalWeight = 0;
  for (const [domain, weight] of Object.entries(weights) as [PolicyDomain, number][]) {
    const salience = 0.65 + ministry.position[domain] / 145;
    score += utilities[domain] * weight * salience;
    totalWeight += weight * salience;
  }
  return clamp(score / Math.max(0.01, totalWeight));
}

function leaderScore(country: Country, utilities: Record<PolicyDomain, number>, draft: TreatyDraft) {
  const leader = country.government.leader;
  let weighted = 0;
  let weight = 0;
  for (const domain of ["economy", "trade", "diplomacy", "defense", "stability"] as PolicyDomain[]) {
    const salience = 0.55 + leader.position[domain] / 100;
    weighted += utilities[domain] * salience;
    weight += salience;
  }
  let score = weighted / weight;
  const concessions = draft.clauses.reduce((sum, clause) => {
    if (clause.kind === "loan" && clause.creditorId === country.id) return sum + 1;
    if (clause.kind === "reparations" && clause.payerId === country.id) return sum + 1.5;
    if (clause.kind === "sanction" && clause.targetId === country.id) return sum + 2;
    return sum;
  }, 0);
  score += (leader.traits.pragmatism - 50) * 0.035;
  score -= concessions * Math.max(0, leader.traits.nationalism - 45) * 0.06;
  return clamp(score);
}

function decisionThreshold(country: Country) {
  const government = country.government;
  return clamp(50 + government.dissent * 0.06 - government.cohesion * 0.025 + Math.max(0, 45 - government.legitimacy) * 0.06, 46, 58);
}

export function evaluateTreatyProposal(
  world: WorldState,
  country: Country,
  draft: TreatyDraft,
  proposalId: string,
  roundNumber: number,
): CabinetEvaluation {
  const utilities = domainUtilities(world, country, draft);
  const components: ProposalScoreComponent[] = [];

  for (const ministry of Object.values(country.government.ministries)) {
    const score = ministryScore(ministry, utilities);
    const weight = 0.55 + ministry.influence / 100 + ministry.competence / 240;
    components.push({
      actor: ministry.kind,
      score: round(score),
      weight: round(weight, 2),
      rationale: `${ministry.name}: economy ${round(utilities.economy)}, trade ${round(utilities.trade)}, diplomacy ${round(utilities.diplomacy)}, defense ${round(utilities.defense)}, stability ${round(utilities.stability)}`,
    });
  }

  const leader = country.government.leader;
  const leaderUtility = leaderScore(country, utilities, draft);
  const leaderWeight = 1.15 + leader.authority / 85;
  components.push({
    actor: "leader",
    score: round(leaderUtility),
    weight: round(leaderWeight, 2),
    rationale: `${leader.title} ${leader.name}: pragmatism ${leader.traits.pragmatism}, nationalism ${leader.traits.nationalism}, authority ${leader.authority}`,
  });

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const totalScore = components.reduce((sum, component) => sum + component.score * component.weight, 0) / Math.max(0.01, totalWeight);
  const threshold = decisionThreshold(country);
  const decision = totalScore >= threshold + 2.5
    ? "approve"
    : totalScore >= threshold - 6 && roundNumber < MAX_ROUNDS
      ? "counter"
      : "reject";

  return {
    countryId: country.id,
    proposalId,
    week: world.week,
    totalScore: round(totalScore),
    threshold: round(threshold),
    decision,
    components,
  };
}

function mostNeededResource(country: Country) {
  return (["food", "energy", "metals", "goods"] as const)
    .map((resource) => ({ resource, weeks: country.resources[resource] / Math.max(0.1, country.needs[resource]) }))
    .sort((a, b) => a.weeks - b.weeks)[0]!.resource;
}

function draftForMotive(world: WorldState, proposer: Country, recipient: Country, motive: NegotiationMotive): TreatyDraft | null {
  const effectiveWeek = world.week + NEGOTIATED_EFFECTIVE_DELAY_WEEKS;
  if (motive === "trade_access") {
    const resource = mostNeededResource(proposer);
    const discount = round(clamp(4 + proposer.government.agenda.tradeOpenness / 20, 5, 9));
    return {
      title: `${proposer.name}–${recipient.name} Trade Compact`,
      parties: [proposer.id, recipient.id],
      effectiveWeek,
      expiryWeek: world.week + 156,
      withdrawalNoticeWeeks: 13,
      clauses: [
        { kind: "preferential_trade", grantorId: proposer.id, beneficiaryId: recipient.id, discountPct: discount, resource },
        { kind: "preferential_trade", grantorId: recipient.id, beneficiaryId: proposer.id, discountPct: discount, resource },
      ],
    };
  }

  if (motive === "security") {
    return {
      title: `${proposer.name}–${recipient.name} Non-Aggression Accord`,
      parties: [proposer.id, recipient.id],
      effectiveWeek,
      expiryWeek: world.week + 208,
      withdrawalNoticeWeeks: 26,
      clauses: [{ kind: "non_aggression" }],
    };
  }

  if (motive === "financing") {
    const creditorReserve = recipient.population * 6;
    const available = Math.max(0, recipient.treasury - creditorReserve);
    const principal = round(clamp(available * 0.055, 3, 12), 2);
    if (available < principal || principal < 3) return null;
    return {
      title: `${recipient.name} Development Credit for ${proposer.name}`,
      parties: [proposer.id, recipient.id],
      effectiveWeek,
      expiryWeek: world.week + 130,
      withdrawalNoticeWeeks: 13,
      clauses: [{
        kind: "loan",
        creditorId: recipient.id,
        debtorId: proposer.id,
        principal,
        installment: round(principal / 8, 2),
        intervalWeeks: 13,
        firstPaymentDelayWeeks: 13,
      }],
    };
  }

  return null;
}

function motiveScores(world: WorldState, proposer: Country, recipient: Country) {
  const relation = proposer.relations[recipient.id]!;
  const route = hasDirectRoute(world, proposer.id, recipient.id);
  const scores: { motive: NegotiationMotive; score: number }[] = [];

  if (route && !atWar(world, proposer.id, recipient.id)) {
    scores.push({
      motive: "trade_access",
      score: 32 + proposer.policy.commerce * 0.24 + proposer.government.agenda.tradeOpenness * 0.23 + relation.trust * 0.18 - relation.tension * 0.10,
    });
  }

  if (!atWar(world, proposer.id, recipient.id)) {
    scores.push({
      motive: "security",
      score: 18 + relation.tension * 0.48 + proposer.policy.diplomacy * 0.20 + proposer.government.agenda.diplomaticEngagement * 0.15 - proposer.policy.expansionism * 0.12 + (route ? 6 : 0),
    });
  }

  const fiscalRatio = proposer.treasury / Math.max(1, proposer.population);
  const creditorRatio = recipient.treasury / Math.max(1, recipient.population);
  if (!atWar(world, proposer.id, recipient.id) && fiscalRatio < 4.6 && creditorRatio > 7.0 && relation.trust > 35) {
    scores.push({
      motive: "financing",
      score: 48 + (4.6 - fiscalRatio) * 5 + relation.trust * 0.17 + proposer.government.agenda.diplomaticEngagement * 0.08,
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

function defensiveDraft(world: WorldState, draft: TreatyDraft) {
  const parsed = validateTreatyDraftInput(world, draft);
  return parsed.ok ? parsed.draft : null;
}

function makeCounterDraft(world: WorldState, proposal: Proposal, counteringCountry: Country): TreatyDraft | null {
  const draft: TreatyDraft = {
    title: proposal.draft.title,
    parties: [...proposal.draft.parties] as [string, string],
    effectiveWeek: Math.max(world.week + 1, proposal.draft.effectiveWeek ?? world.week + NEGOTIATED_EFFECTIVE_DELAY_WEEKS),
    expiryWeek: proposal.draft.expiryWeek,
    withdrawalNoticeWeeks: proposal.draft.withdrawalNoticeWeeks,
    clauses: proposal.draft.clauses.map((clause): TreatyClauseDraft => {
      if (clause.kind === "preferential_trade") {
        return { ...clause, discountPct: round(Math.max(2, clause.discountPct * 0.82)) };
      }
      if (clause.kind === "loan" && clause.creditorId === counteringCountry.id) {
        const principal = round(Math.max(2, clause.principal * 0.75), 2);
        return { ...clause, principal, installment: round(principal / 8, 2) };
      }
      return { ...clause };
    }),
  };
  if (proposal.motive === "security" && draft.expiryWeek !== null && draft.expiryWeek !== undefined) {
    draft.expiryWeek = Math.min(draft.expiryWeek, world.week + 156);
  }
  return defensiveDraft(world, draft);
}

function terminalize(negotiation: Negotiation, status: Negotiation["status"], world: WorldState, reason: string, accepted = false) {
  negotiation.status = status;
  negotiation.lastActionWeek = world.week;
  negotiation.cooldownUntilWeek = world.week + (accepted ? ACCEPTED_COOLDOWN_WEEKS : NEGOTIATION_COOLDOWN_WEEKS);
  negotiation.terminalReason = reason;
}

function proposalById(world: WorldState, id: string | null) {
  if (!id) return undefined;
  const numericId = Number(id.startsWith("proposal-") ? id.slice("proposal-".length) : NaN);
  if (Number.isInteger(numericId) && numericId > 0) {
    const candidate = world.proposals[numericId - 1];
    if (candidate?.id === id) return candidate;
  }
  return world.proposals.find((proposal) => proposal.id === id);
}

function createProposal(
  world: WorldState,
  negotiation: Negotiation,
  proposer: Country,
  recipient: Country,
  motive: NegotiationMotive,
  draft: TreatyDraft,
  roundNumber: number,
  responseToProposalId: string | null,
) {
  const proposalId = `proposal-${world.nextProposalId}`;
  const proposal: Proposal = {
    id: proposalId,
    negotiationId: negotiation.id,
    round: roundNumber,
    proposerId: proposer.id,
    recipientId: recipient.id,
    motive,
    createdWeek: world.week,
    expiresWeek: world.week + PROPOSAL_LIFETIME_WEEKS,
    responseToProposalId,
    draft,
    status: "pending",
    decisionReason: null,
    evaluations: [],
  };
  const proposerEvaluation = evaluateTreatyProposal(world, proposer, draft, proposalId, roundNumber);
  proposal.evaluations.push(proposerEvaluation);
  if (proposerEvaluation.decision === "reject") return null;
  world.nextProposalId += 1;
  world.proposals.push(proposal);
  negotiation.currentProposalId = proposal.id;
  negotiation.proposalIds.push(proposal.id);
  negotiation.lastActionWeek = world.week;
  return proposal;
}

function startNegotiation(world: WorldState, proposer: Country, recipient: Country, motive: NegotiationMotive, rawDraft: TreatyDraft) {
  const draft = defensiveDraft(world, rawDraft);
  if (!draft) return null;
  const id = `negotiation-${world.nextNegotiationId}`;
  const negotiation: Negotiation = {
    id,
    parties: [proposer.id, recipient.id],
    initiatorId: proposer.id,
    motive,
    status: "open",
    startedWeek: world.week,
    lastActionWeek: world.week,
    cooldownUntilWeek: 0,
    currentProposalId: null,
    proposalIds: [],
    maxRounds: MAX_ROUNDS,
    outcomeTreatyId: null,
    terminalReason: null,
  };
  const proposal = createProposal(world, negotiation, proposer, recipient, motive, draft, 1, null);
  if (!proposal) return null;
  world.nextNegotiationId += 1;
  world.negotiations.push(negotiation);
  return { negotiation, proposal };
}

function respondToProposal(world: WorldState, negotiation: Negotiation, proposal: Proposal) {
  const recipient = countryById(world, proposal.recipientId);
  const proposer = countryById(world, proposal.proposerId);
  if (!recipient || !proposer) {
    proposal.status = "rejected";
    proposal.decisionReason = "counterparty missing";
    terminalize(negotiation, "cancelled", world, "counterparty_missing");
    return "A diplomatic negotiation is cancelled because a counterparty no longer exists.";
  }

  const evaluation = evaluateTreatyProposal(world, recipient, proposal.draft, proposal.id, proposal.round);
  proposal.evaluations.push(evaluation);

  if (evaluation.decision === "approve") {
    const result = registerTreaty(world, proposal.draft);
    if (!result.ok) {
      proposal.status = "rejected";
      proposal.decisionReason = `execution validation failed: ${result.errors.join("; ")}`;
      terminalize(negotiation, "rejected", world, proposal.decisionReason);
      return `${recipient.name}'s cabinet cannot execute the proposed ${negotiationMotiveLabel(negotiation.motive)} deal with ${proposer.name}; conditions changed before signature.`;
    }
    proposal.status = "accepted";
    proposal.decisionReason = `cabinet approved at ${evaluation.totalScore}/${evaluation.threshold}`;
    negotiation.outcomeTreatyId = result.treaty.id;
    terminalize(negotiation, "accepted", world, "treaty_signed", true);
    return `${recipient.name}'s cabinet approves ${proposal.draft.title} after ${proposal.round} negotiation round${proposal.round === 1 ? "" : "s"} (utility ${evaluation.totalScore}, threshold ${evaluation.threshold}); ${result.treaty.id} enters the treaty system.`;
  }

  if (evaluation.decision === "counter" && proposal.round < negotiation.maxRounds) {
    const counterDraft = makeCounterDraft(world, proposal, recipient);
    if (counterDraft) {
      proposal.status = "countered";
      proposal.decisionReason = `cabinet countered at ${evaluation.totalScore}/${evaluation.threshold}`;
      const counter = createProposal(world, negotiation, recipient, proposer, proposal.motive, counterDraft, proposal.round + 1, proposal.id);
      if (counter) {
        return `${recipient.name}'s cabinet counters ${proposer.name}'s ${negotiationMotiveLabel(proposal.motive)} proposal in round ${counter.round}; utility ${evaluation.totalScore} is close to its ${evaluation.threshold} approval threshold.`;
      }
    }
  }

  proposal.status = "rejected";
  proposal.decisionReason = `cabinet rejected at ${evaluation.totalScore}/${evaluation.threshold}`;
  terminalize(negotiation, "rejected", world, proposal.decisionReason);
  return `${recipient.name}'s cabinet rejects ${proposer.name}'s ${negotiationMotiveLabel(proposal.motive)} proposal (utility ${evaluation.totalScore}, threshold ${evaluation.threshold}).`;
}

function initiateNegotiations(world: WorldState, rng: NegotiationRng) {
  const messages: string[] = [];
  if (world.week % INITIATION_INTERVAL_WEEKS !== 0) return messages;

  const openCounts = new Map<string, number>();
  const unavailablePairs = new Set<string>();
  for (const negotiation of operationalNegotiations(world)) {
    const key = pairKey(negotiation.parties[0], negotiation.parties[1]);
    if (negotiation.status === "open") {
      unavailablePairs.add(key);
      for (const partyId of negotiation.parties) openCounts.set(partyId, (openCounts.get(partyId) ?? 0) + 1);
    } else if (negotiation.cooldownUntilWeek > world.week) {
      unavailablePairs.add(key);
    }
  }

  let startedThisCycle = 0;
  for (const proposer of world.countries) {
    if (startedThisCycle >= MAX_NEW_NEGOTIATIONS_PER_CYCLE) break;
    if ((openCounts.get(proposer.id) ?? 0) >= diplomaticBandwidth(proposer)) continue;
    const candidates = world.countries
      .filter((recipient) => recipient.id !== proposer.id)
      .filter((recipient) => !unavailablePairs.has(pairKey(proposer.id, recipient.id)))
      .filter((recipient) => (openCounts.get(recipient.id) ?? 0) < diplomaticBandwidth(recipient))
      .flatMap((recipient) => motiveScores(world, proposer, recipient).map((entry) => ({ recipient, ...entry })))
      .sort((a, b) => b.score - a.score);

    for (const candidate of candidates) {
      if (candidate.score < 58) break;
      const draft = draftForMotive(world, proposer, candidate.recipient, candidate.motive);
      if (!draft) continue;
      const validated = defensiveDraft(world, draft);
      if (!validated) continue;
      const previewEvaluation = evaluateTreatyProposal(world, proposer, validated, "candidate", 1);
      if (previewEvaluation.decision !== "approve" || previewEvaluation.totalScore < previewEvaluation.threshold + 3) continue;
      const initiationChance = clamp((candidate.score - 48) / 70 + proposer.government.agenda.diplomaticEngagement / 400, 0.16, 0.58);
      if (rng.next() > initiationChance) break;
      const started = startNegotiation(world, proposer, candidate.recipient, candidate.motive, validated);
      if (!started) continue;
      unavailablePairs.add(pairKey(proposer.id, candidate.recipient.id));
      openCounts.set(proposer.id, (openCounts.get(proposer.id) ?? 0) + 1);
      openCounts.set(candidate.recipient.id, (openCounts.get(candidate.recipient.id) ?? 0) + 1);
      startedThisCycle += 1;
      messages.push(`${proposer.name} opens ${negotiationMotiveLabel(candidate.motive)} talks with ${candidate.recipient.name}; its cabinet authorizes ${started.proposal.draft.title} at utility ${started.proposal.evaluations[0]!.totalScore}.`);
      break;
    }
  }
  return messages;
}

export function processNegotiations(world: WorldState, rng: NegotiationRng) {
  ensureNegotiationState(world);
  const messages: string[] = [];

  for (const negotiation of operationalNegotiations(world)) {
    if (negotiation.status !== "open") continue;
    const current = proposalById(world, negotiation.currentProposalId);
    if (!current) {
      terminalize(negotiation, "cancelled", world, "missing_current_proposal");
      continue;
    }
    if (atWar(world, negotiation.parties[0], negotiation.parties[1])) {
      current.status = "rejected";
      current.decisionReason = "war began during negotiation";
      terminalize(negotiation, "cancelled", world, "war_began_during_negotiation");
      messages.push(`${countryById(world, negotiation.parties[0])?.name ?? negotiation.parties[0]} and ${countryById(world, negotiation.parties[1])?.name ?? negotiation.parties[1]} suspend diplomatic talks as war begins.`);
      continue;
    }
    if (current.status !== "pending") continue;
    if (world.week > current.expiresWeek) {
      current.status = "expired";
      current.decisionReason = "proposal response window expired";
      terminalize(negotiation, "expired", world, "proposal_expired");
      messages.push(`${current.draft.title} expires without agreement.`);
      continue;
    }
    if (world.week - current.createdWeek < RESPONSE_DELAY_WEEKS) continue;
    const message = respondToProposal(world, negotiation, current);
    if (message) messages.push(message);
  }

  messages.push(...initiateNegotiations(world, rng));
  return messages;
}

export function negotiationMotiveLabel(motive: NegotiationMotive) {
  return ({
    trade_access: "trade-access",
    security: "security",
    financing: "financing",
    sanctions_relief: "sanctions-relief",
    reparations: "reparations",
  } as const)[motive];
}

export function negotiationSummaryFor(country: Country, world: WorldState) {
  ensureNegotiationState(world);
  const negotiations = world.negotiations.filter((negotiation) => negotiation.parties.includes(country.id));
  return {
    total: negotiations.length,
    open: operationalNegotiations(world).filter((negotiation) => negotiation.status === "open" && negotiation.parties.includes(country.id)).length,
    accepted: negotiations.filter((negotiation) => negotiation.status === "accepted").length,
    rejected: negotiations.filter((negotiation) => negotiation.status === "rejected").length,
    bandwidth: diplomaticBandwidth(country),
  };
}
