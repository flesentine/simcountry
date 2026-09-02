import { expect, test } from "vitest";
import { createInitialWorld, getActiveTruce, tickWeek } from "./world";

const YEARS = 500;
const SEEDS = Array.from({ length: 100 }, (_, index) => index + 1);
SEEDS[0] = 1978;

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

test("100 seeded worlds remain viable across 500 simulated years", () => {
  let totalFloorCountries = 0;
  let worldsAtMilitaryFloor = 0;
  const finalReadiness: number[] = [];
  const finalTension: number[] = [];
  const finalTreasuries: number[] = [];

  for (const seed of SEEDS) {
    const world = createInitialWorld(seed);

    for (let week = 0; week < YEARS * 52; week++) {
      tickWeek(world);

      const participants = new Set<string>();
      for (const war of world.wars) {
        expect(participants.has(war.a)).toBe(false);
        expect(participants.has(war.b)).toBe(false);
        expect(getActiveTruce(world, war.a, war.b)).toBeNull();
        participants.add(war.a);
        participants.add(war.b);
      }
    }

    let floorCountries = 0;
    const pairTensions: number[] = [];

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
      expect(numbers.every(Number.isFinite)).toBe(true);
      expect(country.readiness).toBeGreaterThanOrEqual(0);
      expect(country.readiness).toBeLessThanOrEqual(100);
      expect(country.stability).toBeGreaterThanOrEqual(0);
      expect(country.stability).toBeLessThanOrEqual(100);
      expect(country.military).toBeGreaterThanOrEqual(3);
      expect(country.military).toBeLessThanOrEqual(country.militaryCapacity + 0.0001);
      expect(country.treasury).toBeGreaterThanOrEqual(-country.population * 5 - 0.0001);

      if (country.military <= 3.0001) floorCountries++;
      finalReadiness.push(country.readiness);
      finalTreasuries.push(country.treasury);
    }

    for (let i = 0; i < world.countries.length; i++) {
      for (let j = i + 1; j < world.countries.length; j++) {
        const a = world.countries[i]!;
        const b = world.countries[j]!;
        pairTensions.push(a.relations[b.id]!.tension);
      }
    }

    totalFloorCountries += floorCountries;
    if (floorCountries === world.countries.length) worldsAtMilitaryFloor++;
    finalTension.push(...pairTensions);
  }

  expect(worldsAtMilitaryFloor).toBe(0);
  expect(totalFloorCountries).toBeLessThan(SEEDS.length * 2);
  expect(average(finalReadiness)).toBeGreaterThan(35);
  expect(average(finalTension)).toBeLessThan(70);
  expect(Math.max(...finalTreasuries)).toBeLessThan(5_000);
}, 720_000);
