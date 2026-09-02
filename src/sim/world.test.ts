import { describe, expect, test } from "vitest";
import { getTradeIntent } from "../ai/policy";
import { RESOURCE_KEYS } from "../model/types";
import { createInitialWorld, getActiveTruce, tickWeek } from "./world";

function runWeeks(seed: number, weeks: number) {
  const world = createInitialWorld(seed);
  for (let week = 0; week < weeks; week++) tickWeek(world);
  return world;
}

describe("SimCountry phase 0.1 invariants", () => {
  test("same seed remains deterministic", () => {
    const a = runWeeks(1978, 52 * 25);
    const b = runWeeks(1978, 52 * 25);
    expect(a).toEqual(b);
  });

  test("peace settlements create enforceable truces", () => {
    const world = createInitialWorld(1978);
    let sawTruce = false;

    for (let week = 0; week < 52 * 20; week++) {
      tickWeek(world);
      if (world.truces.length > 0) sawTruce = true;
      for (const war of world.wars) {
        expect(getActiveTruce(world, war.a, war.b)).toBeNull();
      }

      const participants = new Set<string>();
      for (const war of world.wars) {
        expect(participants.has(war.a)).toBe(false);
        expect(participants.has(war.b)).toBe(false);
        participants.add(war.a);
        participants.add(war.b);
      }
    }

    expect(sawTruce).toBe(true);
  });

  test("peaceful states rebuild military capacity and readiness", () => {
    const world = createInitialWorld(77);
    for (const country of world.countries) {
      country.policy.risk = 0;
      country.policy.expansionism = 0;
      country.policy.diplomacy = 90;
      for (const relation of Object.values(country.relations)) {
        relation.trust = 80;
        relation.tension = 5;
      }
    }

    const country = world.countries[0]!;
    country.treasury = 500;
    country.military = country.militaryCapacity * 0.4;
    country.readiness = 12;
    const startingMilitary = country.military;
    const startingReadiness = country.readiness;

    for (let week = 0; week < 52 * 2; week++) tickWeek(world);

    expect(world.wars).toHaveLength(0);
    expect(country.military).toBeGreaterThan(startingMilitary);
    expect(country.military).toBeLessThanOrEqual(country.militaryCapacity);
    expect(country.readiness).toBeGreaterThan(startingReadiness + 20);
  });

  test("commerce policy changes how aggressively countries seek trade", () => {
    const lowCommerce = createInitialWorld(101).countries[0]!;
    lowCommerce.policy.commerce = 0;
    for (const resource of RESOURCE_KEYS) {
      lowCommerce.resources[resource] = lowCommerce.needs[resource] * 7;
    }

    const highCommerce = structuredClone(lowCommerce);
    highCommerce.policy.commerce = 100;

    expect(getTradeIntent(lowCommerce)).toBeNull();
    expect(getTradeIntent(highCommerce)).not.toBeNull();
  });

  test("the complete historical ledger is not truncated at 300 events", () => {
    const world = runWeeks(1978, 52 * 500);
    expect(world.events.length).toBeGreaterThan(300);
    expect(world.events.at(-1)?.id).toBe(1);
  }, 90_000);
});
