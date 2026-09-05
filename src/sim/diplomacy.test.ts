import { describe, expect, test } from "vitest";
import type { DiplomaticMemory, TreatyDraft } from "../model/types";
import {
  credibilityReputation,
  ensureDiplomaticState,
  getCredibility,
  memorySalience,
  nonAggressionBreachPressure,
  recordDiplomaticMemory,
  treatyWithdrawalDecision,
} from "./diplomacy";
import { evaluateTreatyProposal } from "./negotiation";
import {
  breachNonAggressionForWar,
  processTreaties,
  registerTreaty,
  requestTreatyWithdrawal,
} from "./treaties";
import { createInitialWorld, tickWeek } from "./world";

describe("Phase 4.2 diplomatic memory and credibility", () => {
  test("initial credibility is directional, deterministic, and distinct from relationship trust", () => {
    const world = createInitialWorld(1978);
    const a = world.countries[0]!;
    const b = world.countries[1]!;

    expect(world.diplomaticMemories).toEqual([]);
    expect(world.nextDiplomaticMemoryId).toBe(1);
    expect(getCredibility(world, a.id, b.id)).toBe(50);
    expect(getCredibility(world, b.id, a.id)).toBe(50);
    expect(a.relations[b.id]!.trust).not.toBe(getCredibility(world, a.id, b.id));
    expect(createInitialWorld(1978).diplomaticCredibility).toEqual(world.diplomaticCredibility);
  });

  test("restored worlds rebuild derived state and continue memory ids safely", () => {
    const world = createInitialWorld(1978);
    const a = world.countries[0]!;
    const b = world.countries[1]!;
    recordDiplomaticMemory(world, {
      subjectId: a.id,
      counterpartId: b.id,
      category: "negotiation_rejected",
      severity: 18,
      sourceType: "negotiation",
      sourceId: "proposal-restored-1",
      description: "First restored memory.",
    });

    const restored = JSON.parse(JSON.stringify(world)) as ReturnType<typeof createInitialWorld>;
    delete (restored as Partial<typeof restored>).nextDiplomaticMemoryId;
    ensureDiplomaticState(restored);
    const memory = recordDiplomaticMemory(restored, {
      subjectId: b.id,
      counterpartId: a.id,
      category: "negotiation_rejected",
      severity: 18,
      sourceType: "negotiation",
      sourceId: "proposal-restored-2",
      description: "Second restored memory.",
    });

    expect(memory?.id).toBe("memory-2");
    expect(restored.diplomaticMemories.map((entry) => entry.id)).toEqual(["memory-1", "memory-2"]);
    expect(getCredibility(restored, a.id, b.id)).toBe(50);
  });

  test("a deliberate non-aggression breach creates one authoritative violation and damages public credibility", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const attacker = world.countries.find((country) => country.id === route.a)!;
    const defender = world.countries.find((country) => country.id === route.b)!;
    const thirdParty = world.countries.find((country) => country.id !== attacker.id && country.id !== defender.id)!;

    const result = registerTreaty(world, {
      title: "Public security accord",
      parties: [attacker.id, defender.id],
      expiryWeek: 160,
      clauses: [{ kind: "non_aggression" }],
    });
    expect(result.ok).toBe(true);
    const directBefore = getCredibility(world, defender.id, attacker.id);
    const publicBefore = getCredibility(world, thirdParty.id, attacker.id);

    const messages = breachNonAggressionForWar(world, attacker.id, defender.id);

    expect(messages).toHaveLength(1);
    expect(result.ok && result.treaty.status).toBe("violated");
    expect(world.treatyViolations).toHaveLength(1);
    expect(world.treatyViolations[0]!.reason).toBe("non_aggression_breach");
    expect(world.diplomaticMemories.filter((memory) => memory.category === "commitment_breached")).toHaveLength(1);
    expect(getCredibility(world, defender.id, attacker.id)).toBeLessThan(directBefore - 30);
    expect(getCredibility(world, thirdParty.id, attacker.id)).toBeLessThan(publicBefore - 8);
    expect(getCredibility(world, defender.id, attacker.id)).toBeLessThan(getCredibility(world, thirdParty.id, attacker.id));
  });

  test("one severe public breach can make a hardline third party consider lawful withdrawal", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const injured = world.countries.find((country) => country.id === route.a)!;
    const unreliable = world.countries.find((country) => country.id === route.b)!;
    const observer = world.countries.find((country) => country.id !== injured.id && country.id !== unreliable.id)!;

    observer.policy.expansionism = 60;
    observer.policy.diplomacy = 35;
    observer.government.agenda.diplomaticEngagement = 35;
    observer.relations[unreliable.id]!.tension = 35;

    const before = treatyWithdrawalDecision(world, observer, unreliable);
    expect(before.eligible).toBe(false);

    recordDiplomaticMemory(world, {
      subjectId: unreliable.id,
      counterpartId: injured.id,
      category: "commitment_breached",
      severity: 90,
      sourceType: "treaty",
      sourceId: "public-breach",
      description: "A severe breach becomes public diplomatic knowledge.",
    });

    const damagedCredibility = getCredibility(world, observer.id, unreliable.id);
    const after = treatyWithdrawalDecision(world, observer, unreliable);
    expect(damagedCredibility).toBeGreaterThanOrEqual(38);
    expect(damagedCredibility).toBeLessThan(42);
    expect(after.eligible).toBe(true);
    expect(after.chance).toBeGreaterThanOrEqual(0.15);
    expect(after.chance).toBeLessThanOrEqual(0.25);

    // The public credibility scar should remain actionable after substantial
    // decay; the former <42 gate closed before this point.
    world.week = 260;
    const decayed = treatyWithdrawalDecision(world, observer, unreliable);
    expect(decayed.credibility).toBeGreaterThan(42);
    expect(decayed.credibility).toBeLessThan(45);
    expect(decayed.eligible).toBe(true);
    expect(decayed.chance).toBeGreaterThan(0.10);

    observer.policy.expansionism = 0;
    observer.policy.diplomacy = 100;
    observer.government.agenda.diplomaticEngagement = 100;
    observer.relations[unreliable.id]!.tension = 20;
    expect(treatyWithdrawalDecision(world, observer, unreliable).eligible).toBe(false);
  });

  test("lawful withdrawal is remembered but is not treated as a credibility breach", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const a = world.countries.find((country) => country.id === route.a)!;
    const b = world.countries.find((country) => country.id === route.b)!;
    const result = registerTreaty(world, {
      title: "Withdrawable accord",
      parties: [a.id, b.id],
      withdrawalNoticeWeeks: 0,
      expiryWeek: 120,
      clauses: [{ kind: "non_aggression" }],
    });
    expect(result.ok).toBe(true);
    const before = getCredibility(world, b.id, a.id);

    const withdrawal = requestTreatyWithdrawal(world, result.ok ? result.treaty.id : "", a.id);

    expect(withdrawal.ok).toBe(true);
    expect(result.ok && result.treaty.status).toBe("withdrawn");
    expect(world.treatyViolations).toHaveLength(0);
    expect(world.diplomaticMemories.some((memory) => memory.category === "lawful_withdrawal" && memory.subjectId === a.id)).toBe(true);
    expect(getCredibility(world, b.id, a.id)).toBeCloseTo(before, 8);
  });

  test("clean treaty completion raises credibility and records honored commitments", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const a = world.countries.find((country) => country.id === route.a)!;
    const b = world.countries.find((country) => country.id === route.b)!;
    const result = registerTreaty(world, {
      title: "Short confidence accord",
      parties: [a.id, b.id],
      expiryWeek: 1,
      clauses: [{ kind: "non_aggression" }],
    });
    expect(result.ok).toBe(true);
    const before = getCredibility(world, b.id, a.id);

    tickWeek(world);

    expect(result.ok && result.treaty.status).toBe("expired");
    expect(world.diplomaticMemories.some((memory) => memory.category === "commitment_honored" && memory.subjectId === a.id)).toBe(true);
    expect(getCredibility(world, b.id, a.id)).toBeGreaterThan(before + 5);
  });

  test("memory categories decay at different rates without deleting historical truth", () => {
    const base = {
      id: "memory-test",
      week: 0,
      subjectId: "a",
      counterpartId: "b",
      severity: 80,
      sourceType: "treaty" as const,
      sourceId: "source",
      description: "test",
    };
    const breach: DiplomaticMemory = { ...base, category: "commitment_breached" };
    const signed: DiplomaticMemory = { ...base, id: "memory-signed", category: "agreement_signed" };

    expect(memorySalience(breach, 260)).toBeGreaterThan(memorySalience(signed, 260));
    expect(memorySalience(breach, 520)).toBeGreaterThan(0);
  });

  test("low credibility independently lowers cabinet support for a counterpart's promise", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const a = world.countries.find((country) => country.id === route.a)!;
    const b = world.countries.find((country) => country.id === route.b)!;
    a.relations[b.id]!.trust = 65;
    a.relations[b.id]!.tension = 35;

    const draft: TreatyDraft = {
      title: "Credibility-sensitive security accord",
      parties: [a.id, b.id],
      effectiveWeek: 8,
      expiryWeek: 160,
      clauses: [{ kind: "non_aggression" }],
    };
    const before = evaluateTreatyProposal(world, a, draft, "proposal-before", 1).totalScore;

    recordDiplomaticMemory(world, {
      subjectId: b.id,
      counterpartId: a.id,
      category: "commitment_breached",
      severity: 90,
      sourceType: "treaty",
      sourceId: "historic-breach",
      description: "B broke a prior commitment to A.",
    });
    // Keep current warmth fixed: this isolates credibility from relationship trust.
    a.relations[b.id]!.trust = 65;
    a.relations[b.id]!.tension = 35;
    const after = evaluateTreatyProposal(world, a, draft, "proposal-after", 1).totalScore;

    expect(after).toBeLessThan(before - 3);
    expect(getCredibility(world, a.id, b.id)).toBeLessThan(20);
  });

  test("a solvent hardline debtor can deliberately refuse payment", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const creditor = world.countries.find((country) => country.id === route.a)!;
    const debtor = world.countries.find((country) => country.id === route.b)!;
    creditor.treasury = Math.max(creditor.treasury, creditor.population * 8 + 20);
    const result = registerTreaty(world, {
      title: "Refusal test credit",
      parties: [creditor.id, debtor.id],
      expiryWeek: 30,
      clauses: [{
        kind: "loan",
        creditorId: creditor.id,
        debtorId: debtor.id,
        principal: 3,
        installment: 1,
        intervalWeeks: 1,
        firstPaymentDelayWeeks: 1,
      }],
    });
    expect(result.ok).toBe(true);

    debtor.policy.expansionism = 100;
    debtor.policy.risk = 100;
    debtor.policy.diplomacy = 0;
    debtor.government.agenda.diplomaticEngagement = 0;
    debtor.government.leader.traits.nationalism = 100;
    debtor.government.leader.traits.corruption = 100;
    debtor.relations[creditor.id]!.tension = 100;
    debtor.treasury = Math.max(debtor.treasury, 50);
    const credibilityBefore = getCredibility(world, creditor.id, debtor.id);

    for (let week = 1; week <= 3; week++) {
      world.week = week;
      processTreaties(world);
    }

    const obligation = result.ok ? result.treaty.obligations[0]! : null;
    expect(obligation?.status).toBe("defaulted");
    expect(obligation?.failureReason).toBe("deliberate_refusal");
    const violation = world.treatyViolations.at(-1)!;
    expect(violation.reason).toBe("deliberate_refusal");
    expect(violation.deliberate).toBe(true);
    expect(getCredibility(world, creditor.id, debtor.id)).toBeLessThan(credibilityBefore - 20);
  });

  test("deliberate refusal preserves treasury conservation", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const creditor = world.countries.find((country) => country.id === route.a)!;
    const debtor = world.countries.find((country) => country.id === route.b)!;
    creditor.treasury = Math.max(creditor.treasury, creditor.population * 8 + 20);
    debtor.treasury = Math.max(debtor.treasury, 50);

    const before = world.countries.reduce((sum, country) => sum + country.treasury, 0);
    const result = registerTreaty(world, {
      title: "Conservation test credit",
      parties: [creditor.id, debtor.id],
      expiryWeek: 30,
      clauses: [{
        kind: "loan",
        creditorId: creditor.id,
        debtorId: debtor.id,
        principal: 3,
        installment: 1,
        intervalWeeks: 1,
        firstPaymentDelayWeeks: 1,
      }],
    });
    expect(result.ok).toBe(true);
    expect(world.countries.reduce((sum, country) => sum + country.treasury, 0)).toBeCloseTo(before, 8);

    debtor.policy.expansionism = 100;
    debtor.policy.risk = 100;
    debtor.policy.diplomacy = 0;
    debtor.government.agenda.diplomaticEngagement = 0;
    debtor.government.leader.traits.nationalism = 100;
    debtor.government.leader.traits.corruption = 100;
    debtor.relations[creditor.id]!.tension = 100;

    const afterActivation = world.countries.reduce((sum, country) => sum + country.treasury, 0);
    for (let week = 1; week <= 3; week++) {
      world.week = week;
      processTreaties(world);
    }

    expect(world.treatyViolations.at(-1)?.reason).toBe("deliberate_refusal");
    expect(world.countries.reduce((sum, country) => sum + country.treasury, 0)).toBeCloseTo(afterActivation, 8);
  });

  test("breach pressure distinguishes revisionist and diplomatic governments", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const attacker = world.countries.find((country) => country.id === route.a)!;
    const defender = world.countries.find((country) => country.id === route.b)!;

    attacker.policy.expansionism = 100;
    attacker.policy.risk = 100;
    attacker.policy.diplomacy = 0;
    attacker.government.agenda.defensePosture = 100;
    attacker.government.agenda.diplomaticEngagement = 0;
    attacker.government.leader.traits.ambition = 100;
    attacker.relations[defender.id]!.tension = 100;
    const hardline = nonAggressionBreachPressure(world, attacker, defender);

    attacker.policy.expansionism = 0;
    attacker.policy.risk = 0;
    attacker.policy.diplomacy = 100;
    attacker.government.agenda.defensePosture = 0;
    attacker.government.agenda.diplomaticEngagement = 100;
    attacker.government.leader.traits.ambition = 0;
    attacker.relations[defender.id]!.tension = 0;
    const diplomatic = nonAggressionBreachPressure(world, attacker, defender);

    expect(hardline).toBeGreaterThanOrEqual(68);
    expect(diplomatic).toBeLessThan(68);
    expect(credibilityReputation(world, attacker.id)).toBeGreaterThanOrEqual(0);
  });
});
