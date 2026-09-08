import { describe, expect, test } from "vitest";
import type { Negotiation, Proposal, TreatyDraft } from "../model/types";
import { assessDebtorRepaymentFromBelief, assessPotentialCreditorFromBelief, bestTradeOpportunityFromBelief, diplomaticBandwidth, evaluateTreatyProposal, processNegotiations, proposedTreatyVisibility } from "./negotiation";
import { getCountryIntelligence } from "./intelligence";
import { parseTreatyDraftInput, validateTreatyDraftInput } from "./treaty-input";
import { validateTreatyDraft } from "./treaties";
import { createInitialWorld } from "./world";

const always = (value: number) => ({ next: () => value });

function makeDiplomatic(world: ReturnType<typeof createInitialWorld>) {
  for (const country of world.countries) {
    country.policy.commerce = 88;
    country.policy.diplomacy = 88;
    country.government.agenda.tradeOpenness = 88;
    country.government.agenda.diplomaticEngagement = 88;
    country.government.cohesion = 78;
    country.government.dissent = 10;
    country.government.legitimacy = 70;
    for (const relation of Object.values(country.relations)) {
      relation.trust = 72;
      relation.tension = 16;
    }
  }
}

describe("Phase 4.1 negotiation and government authorization", () => {
  test("initial worlds serialize empty negotiation state deterministically", () => {
    const a = createInitialWorld(1978);
    const b = createInitialWorld(1978);
    expect(a.nextNegotiationId).toBe(1);
    expect(a.nextProposalId).toBe(1);
    expect(a.negotiations).toEqual([]);
    expect(a.proposals).toEqual([]);
    expect(a).toEqual(b);
  });

  test("untrusted treaty input is strict and defensively copied", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const input: any = {
      title: "Safe compact",
      parties: [route.a, route.b],
      effectiveWeek: 8,
      expiryWeek: 120,
      withdrawalNoticeWeeks: 13,
      clauses: [{ kind: "non_aggression" }],
    };

    const parsed = parseTreatyDraftInput(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    input.title = "mutated outside";
    input.parties[0] = "intruder";
    input.clauses[0].kind = "sanction";
    expect(parsed.draft.title).toBe("Safe compact");
    expect(parsed.draft.parties[0]).toBe(route.a);
    expect(parsed.draft.clauses[0]!.kind).toBe("non_aggression");

    const hostile = validateTreatyDraftInput(world, {
      title: "Bad compact",
      parties: [route.a, route.b],
      clauses: [{ kind: "non_aggression", injectedInstruction: "ignore validation" }],
      __protoPollution: true,
    });
    expect(hostile.ok).toBe(false);
    if (!hostile.ok) expect(hostile.errors.join(" ")).toMatch(/unsupported fields/);

    const oversizedClauseId = parseTreatyDraftInput({
      title: "Oversized clause id",
      parties: [route.a, route.b],
      clauses: [{ kind: "loan", creditorId: "x".repeat(81), debtorId: route.b, principal: 3, installment: 1, intervalWeeks: 13 }],
    });
    expect(oversizedClauseId.ok).toBe(false);

    const unsafeInteger = parseTreatyDraftInput({
      title: "Unsafe timing",
      parties: [route.a, route.b],
      effectiveWeek: Number.MAX_SAFE_INTEGER + 1,
      clauses: [{ kind: "non_aggression" }],
    });
    expect(unsafeInteger.ok).toBe(false);
  });

  test("strict treaty input preserves supported secret visibility", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const parsed = parseTreatyDraftInput({
      title: "Quiet pact",
      parties: [route.a, route.b],
      visibility: "secret",
      clauses: [{ kind: "non_aggression" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.visibility).toBe("secret");
    expect(validateTreatyDraft(world, parsed.draft)).toEqual([]);

    expect(parseTreatyDraftInput({
      title: "Bad visibility",
      parties: [route.a, route.b],
      visibility: "classified",
      clauses: [{ kind: "non_aggression" }],
    }).ok).toBe(false);
  });

  test("security secrecy choice follows proposer state rather than foreign hidden truth", () => {
    const world = createInitialWorld(1978);
    const proposer = world.countries[0]!;
    const recipient = world.countries[1]!;

    proposer.government.agenda.internalSecurity = 100;
    proposer.government.agenda.defensePosture = 100;
    proposer.government.agenda.diplomaticEngagement = 0;
    proposer.government.leader.traits.ambition = 100;
    proposer.government.leader.traits.nationalism = 100;
    proposer.policy.risk = 100;
    proposer.relations[recipient.id]!.tension = 100;

    const before = proposedTreatyVisibility(proposer, recipient, "security");
    expect(before).toBe("secret");

    recipient.military = 99_999;
    recipient.readiness = 100;
    recipient.treasury = -99_999;
    recipient.population = 9_999;
    recipient.stability = 0;
    for (const resource of ["food", "energy", "metals", "goods"] as const) {
      recipient.resources[resource] = 99_999;
      recipient.needs[resource] = 0.01;
    }

    expect(proposedTreatyVisibility(proposer, recipient, "security")).toBe(before);
    expect(proposedTreatyVisibility(proposer, recipient, "trade_access")).toBe("public");
    expect(proposedTreatyVisibility(proposer, recipient, "financing")).toBe("public");
  });

  test("autonomous trade talks require perceived resource complementarity", () => {
    const world = createInitialWorld(1978);
    makeDiplomatic(world);
    const resources = ["food", "energy", "metals", "goods"] as const;
    for (const country of world.countries) {
      country.policy.commerce = 100;
      country.policy.diplomacy = 10;
      country.government.agenda.tradeOpenness = 100;
      country.government.agenda.diplomaticEngagement = 80;
      country.resources.food = country.needs.food * 1.5;
      for (const resource of resources.filter((resource) => resource !== "food")) {
        country.resources[resource] = country.needs[resource] * 10;
      }
      for (const relation of Object.values(country.relations)) {
        relation.trust = 70;
        relation.tension = 5;
      }
    }
    for (const observer of world.countries) {
      for (const subject of world.countries) {
        if (observer.id === subject.id) continue;
        const profile = getCountryIntelligence(world, observer.id, subject.id)!;
        for (const resource of resources) {
          const metric = `${resource}Exportable` as const;
          profile.estimates[metric] = {
            value: resource === "food" ? 120 : 0,
            low: resource === "food" ? 100 : 0,
            high: resource === "food" ? 140 : 4,
            confidence: 90,
            observedWeek: world.week,
          };
        }
      }
    }

    world.week = 13;
    processNegotiations(world, always(0));

    const tradeProposal = world.proposals.find((proposal) => proposal.motive === "trade_access");
    expect(tradeProposal).toBeDefined();
    const preferenceClauses = tradeProposal!.draft.clauses.filter((clause) => clause.kind === "preferential_trade");
    expect(preferenceClauses.length).toBeGreaterThan(0);
    for (const clause of preferenceClauses) {
      if (clause.kind !== "preferential_trade" || !clause.resource) continue;
      const buyer = world.countries.find((country) => country.id === clause.grantorId)!;
      const profile = getCountryIntelligence(world, buyer.id, clause.beneficiaryId)!;
      const metric = `${clause.resource}Exportable` as const;
      expect(clause.resource).toBe("food");
      expect(profile.estimates[metric].value).toBeGreaterThan(0);
      expect(buyer.resources[clause.resource] / Math.max(0.1, buyer.needs[clause.resource])).toBeLessThanOrEqual(6.5);
    }
  });

  test("trade negotiation opportunity follows stored supplier belief rather than hidden stock", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const buyer = world.countries.find((country) => country.id === route.a)!;
    const seller = world.countries.find((country) => country.id === route.b)!;
    buyer.resources.food = buyer.needs.food;
    const profile = getCountryIntelligence(world, buyer.id, seller.id)!;
    profile.estimates.foodExportable = { value: 150, low: 120, high: 180, confidence: 90, observedWeek: world.week };
    profile.estimates.energyExportable = { value: 0, low: 0, high: 5, confidence: 90, observedWeek: world.week };
    profile.estimates.metalsExportable = { value: 0, low: 0, high: 5, confidence: 90, observedWeek: world.week };
    profile.estimates.goodsExportable = { value: 0, low: 0, high: 5, confidence: 90, observedWeek: world.week };

    const before = bestTradeOpportunityFromBelief(world, buyer, seller);
    expect(before?.resource).toBe("food");

    seller.resources.food = 0;
    seller.needs.food = 1_000;
    seller.resources.energy = 100_000;
    seller.needs.energy = 0.1;

    expect(bestTradeOpportunityFromBelief(world, buyer, seller)).toEqual(before);
  });

  test("cautious negotiators hedge stale supplier intelligence farther toward the low bound", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const buyer = world.countries.find((country) => country.id === route.a)!;
    const seller = world.countries.find((country) => country.id === route.b)!;
    buyer.resources.food = buyer.needs.food;
    const estimate = getCountryIntelligence(world, buyer.id, seller.id)!.estimates.foodExportable;
    Object.assign(estimate, {
      value: 100,
      low: 20,
      high: 140,
      confidence: 30,
      observedWeek: world.week - 52,
    });

    buyer.policy.risk = 0;
    buyer.government.leader.traits.riskTolerance = 0;
    const cautious = bestTradeOpportunityFromBelief(world, buyer, seller)!;

    buyer.policy.risk = 100;
    buyer.government.leader.traits.riskTolerance = 100;
    const riskTolerant = bestTradeOpportunityFromBelief(world, buyer, seller)!;

    expect(cautious.resource).toBe("food");
    expect(cautious.perceivedExportableSurplus).toBeLessThan(riskTolerant.perceivedExportableSurplus);
  });

  test("financing initiation follows stored fiscal belief rather than hidden creditor treasury", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const borrower = world.countries.find((country) => country.id === route.a)!;
    const creditor = world.countries.find((country) => country.id === route.b)!;
    const profile = getCountryIntelligence(world, borrower.id, creditor.id)!;
    profile.estimates.treasury = { value: 900, low: 800, high: 1_000, confidence: 88, observedWeek: world.week };
    profile.estimates.population = { value: 50, low: 45, high: 55, confidence: 90, observedWeek: world.week };

    const before = assessPotentialCreditorFromBelief(world, borrower, creditor);
    expect(before?.perceivedTreasuryPerCapita).toBeGreaterThan(7);
    expect(before?.perceivedLendableTreasury).toBeGreaterThan(3);

    creditor.treasury = -10_000;
    creditor.population = 1_000;

    expect(assessPotentialCreditorFromBelief(world, borrower, creditor)).toEqual(before);
  });

  test("false-rich creditor belief can open financing talks before truth blocks execution", () => {
    const world = createInitialWorld(1978);
    makeDiplomatic(world);
    world.week = 13;

    // Week 13 begins with country index 1 in the deterministic proposer order.
    const borrower = world.countries[1]!;
    const creditor = world.countries[2]!;
    borrower.treasury = 0;
    borrower.policy.diplomacy = 0;
    borrower.policy.expansionism = 100;
    borrower.government.agenda.diplomaticEngagement = 80;
    for (const resource of ["food", "energy", "metals", "goods"] as const) {
      borrower.resources[resource] = borrower.needs[resource] * 20;
    }
    for (const relation of Object.values(borrower.relations)) {
      relation.trust = 80;
      relation.tension = 0;
    }

    for (const candidate of world.countries) {
      if (candidate.id === borrower.id) continue;
      const profile = getCountryIntelligence(world, borrower.id, candidate.id)!;
      profile.estimates.treasury = {
        value: candidate.id === creditor.id ? 900 : 10,
        low: candidate.id === creditor.id ? 900 : 10,
        high: candidate.id === creditor.id ? 900 : 10,
        confidence: 95,
        observedWeek: world.week,
      };
      profile.estimates.population = {
        value: candidate.id === creditor.id ? 50 : 100,
        low: candidate.id === creditor.id ? 50 : 100,
        high: candidate.id === creditor.id ? 50 : 100,
        confidence: 95,
        observedWeek: world.week,
      };
    }

    // Hidden truth contradicts the borrower's belief.
    creditor.treasury = 0;

    processNegotiations(world, always(0));
    const proposal = world.proposals.find(
      (candidate) => candidate.proposerId === borrower.id
        && candidate.recipientId === creditor.id
        && candidate.motive === "financing",
    );
    expect(proposal).toBeDefined();
    // Opening the talks proves the borrower did not consult the creditor's
    // hidden treasury. Full execution validation still sees authoritative
    // funding truth and would block this draft at signature.
    expect(validateTreatyDraft(world, proposal!.draft).join(" ")).toMatch(/cannot fund/i);
    expect(world.treaties).toHaveLength(0);
  });

  test("proposal validation defers foreign creditor funding truth until signature", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const borrower = world.countries.find((country) => country.id === route.a)!;
    const creditor = world.countries.find((country) => country.id === route.b)!;
    creditor.treasury = 0;

    const draft: TreatyDraft = {
      title: "Belief-driven credit proposal",
      parties: [borrower.id, creditor.id],
      effectiveWeek: 8,
      expiryWeek: 140,
      withdrawalNoticeWeeks: 13,
      clauses: [{
        kind: "loan",
        creditorId: creditor.id,
        debtorId: borrower.id,
        principal: 5,
        installment: 1,
        intervalWeeks: 13,
        firstPaymentDelayWeeks: 13,
      }],
    };

    const borrowerProposalErrors = validateTreatyDraft(world, draft, { fundingObserverId: borrower.id });
    expect(borrowerProposalErrors.join(" ")).not.toMatch(/cannot fund/i);

    const creditorSelfCheckErrors = validateTreatyDraft(world, draft, { fundingObserverId: creditor.id });
    expect(creditorSelfCheckErrors.join(" ")).toMatch(/cannot fund/i);

    const signatureErrors = validateTreatyDraft(world, draft);
    expect(signatureErrors.join(" ")).toMatch(/cannot fund/i);
  });

  test("missing foreign intelligence blocks economic negotiation opportunity", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const observer = world.countries.find((country) => country.id === route.a)!;
    const subject = world.countries.find((country) => country.id === route.b)!;
    delete world.intelligence.byObserver[observer.id]![subject.id];

    expect(bestTradeOpportunityFromBelief(world, observer, subject)).toBeNull();
    expect(assessPotentialCreditorFromBelief(world, observer, subject)).toBeNull();
  });

  test("cabinet evaluation exposes leader and every ministry utility", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const country = world.countries.find((candidate) => candidate.id === route.a)!;
    const other = world.countries.find((candidate) => candidate.id === route.b)!;
    const draft: TreatyDraft = {
      title: "Cabinet test compact",
      parties: [country.id, other.id],
      effectiveWeek: 8,
      expiryWeek: 156,
      clauses: [
        { kind: "preferential_trade", grantorId: country.id, beneficiaryId: other.id, discountPct: 6, resource: "goods" },
        { kind: "preferential_trade", grantorId: other.id, beneficiaryId: country.id, discountPct: 6, resource: "goods" },
      ],
    };
    const evaluation = evaluateTreatyProposal(world, country, draft, "proposal-test", 1);
    expect(evaluation.components).toHaveLength(6);
    expect(new Set(evaluation.components.map((component) => component.actor))).toEqual(new Set(["leader", "finance", "trade", "foreign", "defense", "interior"]));
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(0);
    expect(evaluation.totalScore).toBeLessThanOrEqual(100);
    expect(["approve", "counter", "reject"]).toContain(evaluation.decision);
  });

  test("autonomous diplomacy opens bounded talks and can sign a treaty after response delay", () => {
    const world = createInitialWorld(1978);
    makeDiplomatic(world);
    world.week = 13;

    const openingMessages = processNegotiations(world, always(0));
    expect(openingMessages.length).toBeGreaterThan(0);
    expect(world.negotiations.some((negotiation) => negotiation.status === "open")).toBe(true);
    expect(world.proposals.length).toBeGreaterThan(0);

    for (const country of world.countries) {
      const open = world.negotiations.filter((negotiation) => negotiation.status === "open" && negotiation.parties.includes(country.id)).length;
      expect(open).toBeLessThanOrEqual(diplomaticBandwidth(country));
    }

    for (let week = 14; week <= 18; week++) {
      world.week = week;
      processNegotiations(world, always(1));
    }

    expect(world.negotiations.some((negotiation) => negotiation.status === "accepted")).toBe(true);
    expect(world.treaties.length).toBeGreaterThan(0);
    const signed = world.treaties[0]!;
    expect(signed.signedWeek).toBeGreaterThanOrEqual(14);
    expect(signed.effectiveWeek).toBeGreaterThanOrEqual(signed.signedWeek);
  });

  test("a hardline cabinet can reject a strategically costly agreement", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const proposer = world.countries.find((country) => country.id === route.a)!;
    const recipient = world.countries.find((country) => country.id === route.b)!;
    world.week = 14;

    recipient.policy.expansionism = 100;
    recipient.policy.diplomacy = 5;
    recipient.government.dissent = 100;
    recipient.government.cohesion = 0;
    recipient.government.legitimacy = 0;
    recipient.relations[proposer.id]!.trust = 5;
    recipient.relations[proposer.id]!.tension = 5;

    const draft: TreatyDraft = {
      title: "Strategically costly non-aggression pact",
      parties: [proposer.id, recipient.id],
      effectiveWeek: 21,
      expiryWeek: 180,
      withdrawalNoticeWeeks: 26,
      clauses: [{ kind: "non_aggression" }],
    };
    const negotiation: Negotiation = {
      id: "negotiation-1",
      parties: [proposer.id, recipient.id],
      initiatorId: proposer.id,
      motive: "security",
      status: "open",
      startedWeek: 13,
      lastActionWeek: 13,
      cooldownUntilWeek: 0,
      currentProposalId: "proposal-1",
      proposalIds: ["proposal-1"],
      maxRounds: 3,
      outcomeTreatyId: null,
      terminalReason: null,
    };
    const proposal: Proposal = {
      id: "proposal-1",
      negotiationId: negotiation.id,
      round: 3,
      proposerId: proposer.id,
      recipientId: recipient.id,
      motive: "security",
      createdWeek: 13,
      expiresWeek: 25,
      responseToProposalId: "proposal-0",
      draft,
      status: "pending",
      decisionReason: null,
      evaluations: [],
    };
    world.negotiations.push(negotiation);
    world.proposals.push(proposal);
    world.nextNegotiationId = 2;
    world.nextProposalId = 2;

    processNegotiations(world, always(1));

    expect(proposal.evaluations.at(-1)?.decision).toBe("reject");
    expect(proposal.status).toBe("rejected");
    expect(negotiation.status).toBe("rejected");
    expect(world.treaties).toHaveLength(0);
  });

  test("a failed counter authorization ends talks with an explicit reason", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const debtor = world.countries.find((country) => country.id === route.a)!;
    const creditor = world.countries.find((country) => country.id === route.b)!;
    world.week = 13;
    creditor.relations[debtor.id]!.trust = 80;
    creditor.government.dissent = 100;
    creditor.government.cohesion = 0;
    creditor.government.legitimacy = 45;
    creditor.government.leader.traits.nationalism = 45;
    creditor.government.leader.traits.pragmatism = 50;

    const draft: TreatyDraft = {
      title: "Marginal credit package",
      parties: [debtor.id, creditor.id],
      effectiveWeek: 21,
      expiryWeek: 150,
      withdrawalNoticeWeeks: 13,
      clauses: [{
        kind: "loan",
        creditorId: creditor.id,
        debtorId: debtor.id,
        principal: 3,
        installment: 0.375,
        intervalWeeks: 13,
        firstPaymentDelayWeeks: 13,
      }],
    };
    const negotiation: Negotiation = {
      id: "negotiation-1",
      parties: [debtor.id, creditor.id],
      initiatorId: debtor.id,
      motive: "financing",
      status: "open",
      startedWeek: 13,
      lastActionWeek: 13,
      cooldownUntilWeek: 0,
      currentProposalId: "proposal-1",
      proposalIds: ["proposal-1"],
      maxRounds: 3,
      outcomeTreatyId: null,
      terminalReason: null,
    };
    const proposal: Proposal = {
      id: "proposal-1",
      negotiationId: negotiation.id,
      round: 1,
      proposerId: debtor.id,
      recipientId: creditor.id,
      motive: "financing",
      createdWeek: 13,
      expiresWeek: 25,
      responseToProposalId: null,
      draft,
      status: "pending",
      decisionReason: null,
      evaluations: [],
    };
    world.negotiations.push(negotiation);
    world.proposals.push(proposal);
    world.nextNegotiationId = 2;
    world.nextProposalId = 2;

    world.week = 14;
    processNegotiations(world, always(1));

    expect(proposal.evaluations.at(-1)?.decision).toBe("counter");
    expect(proposal.status).toBe("rejected");
    expect(proposal.decisionReason).toMatch(/counter authorization failed/);
    expect(negotiation.status).toBe("rejected");
    expect(negotiation.terminalReason).toMatch(/counter authorization failed/);
    expect(world.proposals).toHaveLength(1);
  });

  test("a revisionist cabinet issues a self-authorized shorter security counter", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const proposer = world.countries.find((country) => country.id === route.a)!;
    const recipient = world.countries.find((country) => country.id === route.b)!;
    world.week = 13;

    recipient.policy.expansionism = 80;
    recipient.government.dissent = 8;
    recipient.government.cohesion = 0;
    recipient.government.legitimacy = 50;
    recipient.relations[proposer.id]!.trust = 40;
    recipient.relations[proposer.id]!.tension = 40;
    recipient.government.leader.authority = 50;
    recipient.government.leader.traits.pragmatism = 50;
    recipient.government.leader.traits.nationalism = 50;
    recipient.government.leader.position = { economy: 50, trade: 50, diplomacy: 50, defense: 50, stability: 50 };
    for (const ministry of Object.values(recipient.government.ministries)) {
      ministry.competence = 50;
      ministry.influence = 50;
      ministry.position = { economy: 50, trade: 50, diplomacy: 50, defense: 50, stability: 50 };
    }

    const draft: TreatyDraft = {
      title: "Long security pact",
      parties: [proposer.id, recipient.id],
      effectiveWeek: 21,
      expiryWeek: 221,
      withdrawalNoticeWeeks: 26,
      clauses: [{ kind: "non_aggression" }],
    };
    const negotiation: Negotiation = {
      id: "negotiation-1",
      parties: [proposer.id, recipient.id],
      initiatorId: proposer.id,
      motive: "security",
      status: "open",
      startedWeek: 13,
      lastActionWeek: 13,
      cooldownUntilWeek: 0,
      currentProposalId: "proposal-1",
      proposalIds: ["proposal-1"],
      maxRounds: 3,
      outcomeTreatyId: null,
      terminalReason: null,
    };
    const proposal: Proposal = {
      id: "proposal-1",
      negotiationId: negotiation.id,
      round: 1,
      proposerId: proposer.id,
      recipientId: recipient.id,
      motive: "security",
      createdWeek: 13,
      expiresWeek: 25,
      responseToProposalId: null,
      draft,
      status: "pending",
      decisionReason: null,
      evaluations: [],
    };
    world.negotiations.push(negotiation);
    world.proposals.push(proposal);
    world.nextNegotiationId = 2;
    world.nextProposalId = 2;

    world.week = 14;
    processNegotiations(world, always(1));

    const incomingEvaluation = proposal.evaluations.at(-1)!;
    expect(incomingEvaluation.decision).toBe("counter");
    expect(proposal.status).toBe("countered");
    expect(world.proposals).toHaveLength(2);
    const counter = world.proposals[1]!;
    expect(counter.round).toBe(2);
    expect(counter.proposerId).toBe(recipient.id);
    expect(counter.responseToProposalId).toBe(proposal.id);
    expect(counter.evaluations[0]?.decision).toBe("approve");
    expect(counter.draft.expiryWeek).toBeLessThan(draft.expiryWeek!);
  });

});

describe("Phase 5.4 belief-driven loan evaluation", () => {
  function loanCase() {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const creditor = world.countries.find((country) => country.id === route.a)!;
    const debtor = world.countries.find((country) => country.id === route.b)!;
    world.week = 52;
    creditor.treasury = 500;
    creditor.relations[debtor.id]!.trust = 55;
    creditor.relations[debtor.id]!.tension = 20;
    const profile = getCountryIntelligence(world, creditor.id, debtor.id)!;
    profile.estimates.treasury = {
      value: -60,
      low: -100,
      high: 10,
      confidence: 65,
      observedWeek: world.week - 26,
    };
    profile.estimates.population = {
      value: 50,
      low: 40,
      high: 65,
      confidence: 70,
      observedWeek: world.week - 26,
    };
    const draft: TreatyDraft = {
      title: "Belief-priced development loan",
      parties: [creditor.id, debtor.id],
      effectiveWeek: world.week + 8,
      expiryWeek: world.week + 140,
      withdrawalNoticeWeeks: 13,
      clauses: [{
        kind: "loan",
        creditorId: creditor.id,
        debtorId: debtor.id,
        principal: 6,
        installment: 0.75,
        intervalWeeks: 13,
        firstPaymentDelayWeeks: 13,
      }],
    };
    return { world, creditor, debtor, draft };
  }

  test("creditor evaluation follows stored debtor belief rather than hidden fiscal truth", () => {
    const { world, creditor, debtor, draft } = loanCase();
    const beforeAssessment = assessDebtorRepaymentFromBelief(world, creditor, debtor.id);
    const before = evaluateTreatyProposal(world, creditor, draft, "proposal-belief", 1);

    debtor.treasury = 100_000;
    debtor.population = 1_000;

    const afterAssessment = assessDebtorRepaymentFromBelief(world, creditor, debtor.id);
    const after = evaluateTreatyProposal(world, creditor, draft, "proposal-belief", 1);

    expect(afterAssessment).toEqual(beforeAssessment);
    expect(after).toEqual(before);
  });

  test("missing debtor intelligence becomes maximum uncertainty instead of revealing truth", () => {
    const { world, creditor, debtor, draft } = loanCase();
    delete world.intelligence.byObserver[creditor.id]![debtor.id];
    debtor.treasury = 100_000;
    debtor.population = 1_000;

    const before = assessDebtorRepaymentFromBelief(world, creditor, debtor.id);
    const evaluationBefore = evaluateTreatyProposal(world, creditor, draft, "proposal-missing", 1);

    debtor.treasury = -100_000;
    debtor.population = 1;

    const after = assessDebtorRepaymentFromBelief(world, creditor, debtor.id);
    const evaluationAfter = evaluateTreatyProposal(world, creditor, draft, "proposal-missing", 1);

    expect(before.available).toBe(false);
    expect(before.perceivedFiscalStress).toBe(100);
    expect(after).toEqual(before);
    expect(evaluationAfter).toEqual(evaluationBefore);
  });

  test("cautious creditors price stale low-confidence debtor intelligence more pessimistically", () => {
    const { world, creditor, debtor } = loanCase();
    const profile = getCountryIntelligence(world, creditor.id, debtor.id)!;
    profile.estimates.treasury = {
      value: -40,
      low: -160,
      high: 20,
      confidence: 30,
      observedWeek: world.week - 52,
    };
    profile.estimates.population = {
      value: 50,
      low: 25,
      high: 80,
      confidence: 30,
      observedWeek: world.week - 52,
    };

    creditor.policy.risk = 0;
    creditor.government.leader.traits.riskTolerance = 0;
    const cautious = assessDebtorRepaymentFromBelief(world, creditor, debtor.id);

    creditor.policy.risk = 100;
    creditor.government.leader.traits.riskTolerance = 100;
    const riskTolerant = assessDebtorRepaymentFromBelief(world, creditor, debtor.id);

    expect(cautious.available).toBe(true);
    expect(cautious.perceivedTreasury).toBeLessThan(riskTolerant.perceivedTreasury);
    expect(cautious.perceivedPopulation).toBeLessThan(riskTolerant.perceivedPopulation);
    expect(cautious.perceivedFiscalStress).toBeGreaterThan(riskTolerant.perceivedFiscalStress);
    expect(cautious.intelligenceAgeWeeks).toBe(52);
  });
});

