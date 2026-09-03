import { describe, expect, test } from "vitest";
import type { Negotiation, Proposal, TreatyDraft } from "../model/types";
import { diplomaticBandwidth, evaluateTreatyProposal, processNegotiations } from "./negotiation";
import { parseTreatyDraftInput, validateTreatyDraftInput } from "./treaty-input";
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

  test("a marginal creditor cabinet issues a real counterproposal", () => {
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
    const evaluation = proposal.evaluations.at(-1)!;
    expect(evaluation.decision).toBe("counter");
    expect(proposal.status).toBe("countered");
    expect(world.proposals).toHaveLength(2);
    expect(world.proposals[1]!.round).toBe(2);
    expect(world.proposals[1]!.proposerId).toBe(creditor.id);
    expect(world.proposals[1]!.responseToProposalId).toBe(proposal.id);
  });
});
