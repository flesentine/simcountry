import { describe, expect, test } from "vitest";
import { getTradeIntent, warAppetite } from "../ai/policy";
import { runGovernments } from "./governance";
import { createInitialWorld, tickWeek } from "./world";

const fixedRng = { next: () => 0.5, int: (min: number, max: number) => Math.floor((min + max) / 2) };

describe("SimCountry phase 3 governments and delegation", () => {
  test("same seed creates deterministic leaders, ministries and agendas", () => {
    const a = createInitialWorld(1978);
    const b = createInitialWorld(1978);
    expect(a.countries.map((country) => country.government)).toEqual(b.countries.map((country) => country.government));
    for (const country of a.countries) {
      expect(Object.keys(country.government.ministries)).toHaveLength(5);
      expect(country.government.objectives).toHaveLength(3);
      expect(country.government.leader.name.length).toBeGreaterThan(3);
    }
  });

  test("quarterly cabinet bargaining produces bounded dissent, cohesion and delegated progress", () => {
    const world = createInitialWorld(1978);
    const country = world.countries[0]!;
    country.government.leader.position.defense = 95;
    country.government.ministries.finance.position.defense = 8;
    country.government.ministries.defense.position.defense = 98;
    country.government.ministries.foreign.position.defense = 12;
    world.week = 13;
    const messages = runGovernments(world, fixedRng);

    expect(country.government.dissent).toBeGreaterThan(10);
    expect(country.government.dissent).toBeLessThanOrEqual(100);
    expect(country.government.cohesion).toBeGreaterThanOrEqual(0);
    expect(country.government.cohesion).toBeLessThanOrEqual(100);
    expect(country.government.objectives).toHaveLength(3);
    expect(country.government.objectives.every((objective) => Number.isFinite(objective.progress))).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });

  test("sustained institutional disagreement produces lower cabinet cohesion", () => {
    const alignedWorld = createInitialWorld(1978);
    const dividedWorld = createInitialWorld(1978);
    const aligned = alignedWorld.countries[0]!;
    const divided = dividedWorld.countries[0]!;
    aligned.government.cohesion = divided.government.cohesion = 70;
    aligned.government.legitimacy = divided.government.legitimacy = 60;

    for (const position of [aligned.government.leader.position, ...Object.values(aligned.government.ministries).map((ministry) => ministry.position)]) {
      position.economy = 55;
      position.trade = 55;
      position.diplomacy = 55;
      position.defense = 55;
      position.stability = 55;
    }
    divided.government.leader.position.defense = 95;
    divided.government.leader.position.trade = 90;
    divided.government.ministries.finance.position.defense = 5;
    divided.government.ministries.finance.position.trade = 10;
    divided.government.ministries.defense.position.defense = 95;
    divided.government.ministries.trade.position.trade = 95;
    divided.government.ministries.foreign.position.defense = 8;
    divided.government.ministries.interior.position.trade = 12;

    for (let quarter = 1; quarter <= 12; quarter++) {
      alignedWorld.week = quarter * 13;
      dividedWorld.week = quarter * 13;
      runGovernments(alignedWorld, fixedRng);
      runGovernments(dividedWorld, fixedRng);
    }

    expect(divided.government.dissent).toBeGreaterThan(aligned.government.dissent + 10);
    expect(divided.government.cohesion).toBeLessThan(aligned.government.cohesion - 8);
    expect(aligned.government.cohesion).toBeLessThanOrEqual(92);
  });

  test("government fiscal choices change authoritative weekly cash flow", () => {
    const highTax = createInitialWorld(1978);
    const lowTax = createInitialWorld(1978);
    const a = highTax.countries[0]!;
    const b = lowTax.countries[0]!;
    a.government.agenda.taxEffort = 100;
    a.government.agenda.civilSpending = 10;
    b.government.agenda.taxEffort = 0;
    b.government.agenda.civilSpending = 100;
    const beforeA = a.treasury;
    const beforeB = b.treasury;

    tickWeek(highTax);
    tickWeek(lowTax);

    expect(beforeA).toBe(beforeB);
    expect(a.treasury - beforeA).toBeGreaterThan(b.treasury - beforeB);
  });

  test("trade ministry agenda changes import urgency without mutating resources", () => {
    const openWorld = createInitialWorld(1978);
    const closedWorld = createInitialWorld(1978);
    const open = openWorld.countries[0]!;
    const closed = closedWorld.countries[0]!;
    open.government.agenda.tradeOpenness = 100;
    open.government.ministries.trade.competence = 95;
    closed.government.agenda.tradeOpenness = 0;
    closed.government.ministries.trade.competence = 25;
    open.resources.food = closed.resources.food = 10;

    const openIntent = getTradeIntent(open);
    const closedIntent = getTradeIntent(closed);
    expect(openIntent).not.toBeNull();
    expect(closedIntent).not.toBeNull();
    expect(openIntent!.urgency).toBeGreaterThanOrEqual(closedIntent!.urgency);
    expect(open.resources.food).toBe(10);
    expect(closed.resources.food).toBe(10);
  });

  test("war appetite requires cabinet support rather than leader policy alone", () => {
    const world = createInitialWorld(1978);
    const attacker = world.countries[0]!;
    const defender = world.countries.find((country) => country.id !== attacker.id && world.geography.adjacency[attacker.id]?.includes(country.id)) ?? world.countries[1]!;
    attacker.relations[defender.id]!.tension = 98;
    attacker.relations[defender.id]!.trust = 2;
    attacker.readiness = 85;
    attacker.stability = 80;
    attacker.military = attacker.militaryCapacity;
    defender.military = Math.max(3, defender.militaryCapacity * 0.45);
    attacker.government.legitimacy = 80;
    attacker.government.cohesion = 80;
    attacker.government.agenda.defensePosture = 10;
    const reluctant = warAppetite(attacker, defender);
    attacker.government.agenda.defensePosture = 95;
    const hawkish = warAppetite(attacker, defender);
    expect(hawkish).toBeGreaterThan(reluctant * 3);
  });

  test("governments remain bounded and continue making decisions across decades", () => {
    const world = createInitialWorld(1978);
    for (let week = 0; week < 52 * 40; week++) tickWeek(world);
    for (const country of world.countries) {
      expect(country.government.legitimacy).toBeGreaterThanOrEqual(0);
      expect(country.government.legitimacy).toBeLessThanOrEqual(100);
      expect(country.government.cohesion).toBeGreaterThanOrEqual(0);
      expect(country.government.cohesion).toBeLessThanOrEqual(100);
      expect(country.government.dissent).toBeGreaterThanOrEqual(0);
      expect(country.government.dissent).toBeLessThanOrEqual(100);
      expect(country.government.objectives).toHaveLength(3);
      expect(country.government.lastDecisionWeek).toBeGreaterThan(0);
    }
    expect(world.events.some((event) => event.kind === "politics" && event.text.includes("cabinet agenda"))).toBe(true);
  });
});
