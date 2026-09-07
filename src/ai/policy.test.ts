import { describe, expect, test } from "vitest";
import {
  assessTradePartnerFromIntelligence,
  assessWarFromIntelligence,
  chooseTradePartner,
  nonAggressionBreachGate,
  nonAggressionFeasibilityBonus,
} from "./policy";
import { getBestTradeRoute } from "../sim/geography";
import { collectCountryIntelligence, getCountryIntelligence } from "../sim/intelligence";
import { createInitialWorld } from "../sim/world";

function prepareWarCase(seed = 1978) {
  const world = createInitialWorld(seed);
  const attacker = world.countries[0]!;
  const defender = world.countries[1]!;
  attacker.readiness = 90;
  attacker.stability = 90;
  attacker.policy.expansionism = 100;
  attacker.policy.risk = 70;
  attacker.government.legitimacy = 90;
  attacker.government.agenda.defensePosture = 100;
  attacker.government.cohesion = 90;
  attacker.government.ministries.defense.competence = 90;
  attacker.government.leader.traits.ambition = 90;
  attacker.government.leader.traits.nationalism = 90;
  attacker.relations[defender.id]!.trust = 0;
  attacker.relations[defender.id]!.tension = 100;
  return { world, attacker, defender };
}

describe("Phase 5.1 belief-driven war assessment", () => {
  test("war assessment follows stored belief rather than hidden defender truth", () => {
    const { world, attacker, defender } = prepareWarCase();
    const profile = getCountryIntelligence(world, attacker.id, defender.id)!;
    profile.estimates.military = { value: 30, low: 24, high: 36, confidence: 88, observedWeek: world.week };
    profile.estimates.readiness = { value: 48, low: 40, high: 56, confidence: 84, observedWeek: world.week };

    const before = assessWarFromIntelligence(world, attacker, defender);
    expect(before.available).toBe(true);
    expect(before.appetite).toBeGreaterThan(0);

    defender.military = 9_999;
    defender.readiness = 100;
    const after = assessWarFromIntelligence(world, attacker, defender);

    expect(after.perceivedDefenderMilitary).toBeCloseTo(before.perceivedDefenderMilitary, 10);
    expect(after.perceivedDefenderReadiness).toBeCloseTo(before.perceivedDefenderReadiness, 10);
    expect(after.appetite).toBeCloseTo(before.appetite, 10);
  });

  test("missing intelligence blocks war assessment instead of revealing truth", () => {
    const { world, attacker, defender } = prepareWarCase();
    delete world.intelligence.byObserver[attacker.id]![defender.id];

    const assessment = assessWarFromIntelligence(world, attacker, defender);

    expect(assessment.available).toBe(false);
    expect(assessment.appetite).toBe(0);
    expect(assessment.intelligenceConfidence).toBe(0);
  });

  test("underestimating an opponent raises war appetite while truth stays fixed", () => {
    const { world, attacker, defender } = prepareWarCase();
    const profile = getCountryIntelligence(world, attacker.id, defender.id)!;

    profile.estimates.military = { value: 22, low: 18, high: 28, confidence: 90, observedWeek: world.week };
    profile.estimates.readiness = { value: 38, low: 32, high: 45, confidence: 90, observedWeek: world.week };
    const underestimated = assessWarFromIntelligence(world, attacker, defender);

    profile.estimates.military = { value: 95, low: 82, high: 110, confidence: 90, observedWeek: world.week };
    profile.estimates.readiness = { value: 82, low: 72, high: 92, confidence: 90, observedWeek: world.week };
    const overestimated = assessWarFromIntelligence(world, attacker, defender);

    expect(underestimated.appetite).toBeGreaterThan(overestimated.appetite);
  });

  test("military deception causally shifts belief-driven war appetite", () => {
    const { world, attacker, defender } = prepareWarCase();
    attacker.military = 80;
    defender.military = 80;
    defender.readiness = 70;
    const observedWeek = 26;
    world.week = observedWeek;

    world.intelligence.deceptionByCountry[defender.id] = { mode: "none", strengthPct: 0, updatedWeek: observedWeek };
    const baselineProfile = collectCountryIntelligence(world, attacker, defender, observedWeek, "routine");

    world.intelligence.deceptionByCountry[defender.id] = { mode: "conceal", strengthPct: 18, updatedWeek: observedWeek };
    const concealedProfile = collectCountryIntelligence(world, attacker, defender, observedWeek, "routine");

    world.intelligence.deceptionByCountry[defender.id] = { mode: "exaggerate", strengthPct: 18, updatedWeek: observedWeek };
    const exaggeratedProfile = collectCountryIntelligence(world, attacker, defender, observedWeek, "routine");

    world.intelligence.byObserver[attacker.id]![defender.id] = baselineProfile;
    const baseline = assessWarFromIntelligence(world, attacker, defender);
    world.intelligence.byObserver[attacker.id]![defender.id] = concealedProfile;
    const concealed = assessWarFromIntelligence(world, attacker, defender);
    world.intelligence.byObserver[attacker.id]![defender.id] = exaggeratedProfile;
    const exaggerated = assessWarFromIntelligence(world, attacker, defender);

    expect(concealed.perceivedDefenderMilitary).toBeLessThan(baseline.perceivedDefenderMilitary);
    expect(exaggerated.perceivedDefenderMilitary).toBeGreaterThan(baseline.perceivedDefenderMilitary);
    expect(concealed.appetite).toBeGreaterThan(baseline.appetite);
    expect(exaggerated.appetite).toBeLessThan(baseline.appetite);
  });

  test("perceived military advantage adds only a bounded pact-breach feasibility bonus", () => {
    const { world, attacker, defender } = prepareWarCase();
    const profile = getCountryIntelligence(world, attacker.id, defender.id)!;
    profile.estimates.military = { value: 20, low: 16, high: 24, confidence: 90, observedWeek: world.week };
    profile.estimates.readiness = { value: 30, low: 25, high: 36, confidence: 90, observedWeek: world.week };
    const weakDefender = assessWarFromIntelligence(world, attacker, defender);
    const weakBonus = nonAggressionFeasibilityBonus(attacker, weakDefender);

    profile.estimates.military = { value: 200, low: 180, high: 220, confidence: 90, observedWeek: world.week };
    profile.estimates.readiness = { value: 95, low: 90, high: 100, confidence: 90, observedWeek: world.week };
    const strongDefender = assessWarFromIntelligence(world, attacker, defender);

    expect(weakBonus).toBeGreaterThan(0);
    expect(weakBonus).toBeLessThanOrEqual(12);
    expect(nonAggressionFeasibilityBonus(attacker, strongDefender)).toBe(0);
    expect(nonAggressionFeasibilityBonus(attacker, { ...weakDefender, available: false })).toBe(0);
  });

  test("military feasibility cannot create pact-breaking willingness by itself", () => {
    expect(nonAggressionBreachGate(63, 12)).toEqual({ breachPressure: 75, eligible: false });
    expect(nonAggressionBreachGate(64, 3)).toEqual({ breachPressure: 67, eligible: false });
    expect(nonAggressionBreachGate(64, 4)).toEqual({ breachPressure: 68, eligible: true });
    expect(nonAggressionBreachGate(75, 0)).toEqual({ breachPressure: 75, eligible: true });
  });

  test("cautious governments hedge low-confidence intelligence toward the upper bound", () => {
    const { world, attacker, defender } = prepareWarCase();
    const profile = getCountryIntelligence(world, attacker.id, defender.id)!;
    profile.estimates.military = { value: 50, low: 30, high: 90, confidence: 30, observedWeek: world.week - 52 };
    profile.estimates.readiness = { value: 50, low: 30, high: 90, confidence: 30, observedWeek: world.week - 52 };

    attacker.policy.risk = 0;
    attacker.government.leader.traits.riskTolerance = 0;
    const cautious = assessWarFromIntelligence(world, attacker, defender);

    attacker.policy.risk = 100;
    attacker.government.leader.traits.riskTolerance = 100;
    const riskTolerant = assessWarFromIntelligence(world, attacker, defender);

    expect(cautious.perceivedDefenderMilitary).toBeGreaterThan(riskTolerant.perceivedDefenderMilitary);
    expect(cautious.perceivedDefenderReadiness).toBeGreaterThan(riskTolerant.perceivedDefenderReadiness);
  });
});


function prepareTradeCase(seed = 1978) {
  const world = createInitialWorld(seed);
  const buyer = world.countries[0]!;
  const sellers = world.countries
    .slice(1)
    .filter((seller) => Boolean(getBestTradeRoute(world, buyer.id, seller.id)))
    .slice(0, 2);
  expect(sellers).toHaveLength(2);

  for (const seller of world.countries.filter((country) => country.id !== buyer.id)) {
    buyer.relations[seller.id]!.trust = 50;
    buyer.relations[seller.id]!.tension = 20;
    const profile = getCountryIntelligence(world, buyer.id, seller.id)!;
    profile.estimates.foodExportable = {
      value: 0,
      low: 0,
      high: 0,
      confidence: 90,
      observedWeek: world.week,
    };
  }

  return { world, buyer, first: sellers[0]!, second: sellers[1]! };
}

describe("Phase 5.2 belief-driven trade selection", () => {
  test("supplier choice follows stored exportable-supply belief rather than hidden seller inventory", () => {
    const { world, buyer, first, second } = prepareTradeCase();
    const firstIntel = getCountryIntelligence(world, buyer.id, first.id)!;
    const secondIntel = getCountryIntelligence(world, buyer.id, second.id)!;
    firstIntel.estimates.foodExportable = { value: 500, low: 460, high: 540, confidence: 92, observedWeek: world.week };
    secondIntel.estimates.foodExportable = { value: 30, low: 25, high: 35, confidence: 92, observedWeek: world.week };

    const before = chooseTradePartner(world, buyer, "food");
    expect(before?.seller.id).toBe(first.id);

    first.resources.food = 0;
    first.needs.food = 100;
    second.resources.food = 100_000;
    second.needs.food = 0;

    const after = chooseTradePartner(world, buyer, "food");
    expect(after?.seller.id).toBe(first.id);
  });

  test("missing supplier intelligence blocks that candidate instead of revealing hidden stock", () => {
    const { world, buyer, first, second } = prepareTradeCase();
    getCountryIntelligence(world, buyer.id, first.id)!.estimates.foodExportable = {
      value: 500,
      low: 470,
      high: 530,
      confidence: 92,
      observedWeek: world.week,
    };
    getCountryIntelligence(world, buyer.id, second.id)!.estimates.foodExportable = {
      value: 300,
      low: 280,
      high: 320,
      confidence: 92,
      observedWeek: world.week,
    };

    delete world.intelligence.byObserver[buyer.id]![first.id];
    first.resources.food = 100_000;

    expect(chooseTradePartner(world, buyer, "food")?.seller.id).toBe(second.id);
  });

  test("cautious buyers hedge stale low-confidence supplier intelligence toward the low bound", () => {
    const { world, buyer, first } = prepareTradeCase();
    const estimate = getCountryIntelligence(world, buyer.id, first.id)!.estimates.foodExportable;
    Object.assign(estimate, {
      value: 100,
      low: 20,
      high: 140,
      confidence: 30,
      observedWeek: world.week - 52,
    });

    buyer.policy.risk = 0;
    buyer.government.leader.traits.riskTolerance = 0;
    const cautious = assessTradePartnerFromIntelligence(world, buyer, first, "food");

    buyer.policy.risk = 100;
    buyer.government.leader.traits.riskTolerance = 100;
    const riskTolerant = assessTradePartnerFromIntelligence(world, buyer, first, "food");

    expect(cautious.available).toBe(true);
    expect(cautious.perceivedExportableSurplus).toBeLessThan(riskTolerant.perceivedExportableSurplus);
    expect(cautious.intelligenceAgeWeeks).toBe(52);
  });
});
