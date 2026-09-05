import { describe, expect, test } from "vitest";
import { assessWarFromIntelligence } from "./policy";
import { getCountryIntelligence } from "../sim/intelligence";
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
