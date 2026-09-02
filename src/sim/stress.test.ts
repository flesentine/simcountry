import { describe, expect, test } from "vitest";
import { createInitialWorld, getActiveTruce, tickWeek } from "./world";

const YEARS = 500;
const SEEDS = Array.from({ length: 100 }, (_, index) => index + 1);
SEEDS[0] = 1978;
const BATCH_SIZE = 20;
const BATCHES = Array.from({ length: Math.ceil(SEEDS.length / BATCH_SIZE) }, (_, index) =>
  SEEDS.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const aggregate = {
  totalFloorCountries: 0,
  worldsAtMilitaryFloor: 0,
  finalReadiness: [] as number[],
  finalTension: [] as number[],
  finalTreasuries: [] as number[],
};

function runSeed(seed: number) {
  const world = createInitialWorld(seed);

  for (let week = 0; week < YEARS * 52; week++) {
    tickWeek(world);

    const participants = new Set<string>();
    for (const war of world.wars) {
      invariant(!participants.has(war.a), `seed ${seed} week ${world.week}: ${war.a} entered multiple wars`);
      invariant(!participants.has(war.b), `seed ${seed} week ${world.week}: ${war.b} entered multiple wars`);
      invariant(!getActiveTruce(world, war.a, war.b), `seed ${seed} week ${world.week}: active war overlaps a truce`);
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
    invariant(numbers.every(Number.isFinite), `seed ${seed}: ${country.name} has non-finite state`);
    invariant(country.readiness >= 0 && country.readiness <= 100, `seed ${seed}: ${country.name} readiness out of bounds`);
    invariant(country.stability >= 0 && country.stability <= 100, `seed ${seed}: ${country.name} stability out of bounds`);
    invariant(country.military >= 3, `seed ${seed}: ${country.name} military below floor`);
    invariant(country.military <= country.militaryCapacity + 0.0001, `seed ${seed}: ${country.name} military exceeds capacity`);
    invariant(country.treasury >= -country.population * 5 - 0.0001, `seed ${seed}: ${country.name} treasury below debt floor`);

    if (country.military <= 3.0001) floorCountries++;
    aggregate.finalReadiness.push(country.readiness);
    aggregate.finalTreasuries.push(country.treasury);
  }

  for (let i = 0; i < world.countries.length; i++) {
    for (let j = i + 1; j < world.countries.length; j++) {
      const a = world.countries[i]!;
      const b = world.countries[j]!;
      pairTensions.push(a.relations[b.id]!.tension);
    }
  }

  aggregate.totalFloorCountries += floorCountries;
  if (floorCountries === world.countries.length) aggregate.worldsAtMilitaryFloor++;
  aggregate.finalTension.push(...pairTensions);
}

describe.sequential("100 seeded worlds remain viable across 500 simulated years", () => {
  BATCHES.forEach((seeds, batchIndex) => {
    test(`batch ${batchIndex + 1}/${BATCHES.length}: seeds ${seeds[0]}–${seeds.at(-1)}`, () => {
      for (const seed of seeds) runSeed(seed);
    }, 180_000);
  });

  test("aggregate 50,000-year stability thresholds", () => {
    const avgReadiness = average(aggregate.finalReadiness);
    const avgTension = average(aggregate.finalTension);
    const maxTreasury = Math.max(...aggregate.finalTreasuries);

    console.log(JSON.stringify({
      worlds: SEEDS.length,
      yearsPerWorld: YEARS,
      worldsAtMilitaryFloor: aggregate.worldsAtMilitaryFloor,
      totalFloorCountries: aggregate.totalFloorCountries,
      avgReadiness,
      avgTension,
      maxTreasury,
    }));

    expect(aggregate.finalReadiness).toHaveLength(SEEDS.length * 8);
    expect(aggregate.worldsAtMilitaryFloor).toBe(0);
    expect(aggregate.totalFloorCountries).toBeLessThan(SEEDS.length * 2);
    expect(avgReadiness).toBeGreaterThan(35);
    expect(avgTension).toBeLessThan(70);
    expect(maxTreasury).toBeLessThan(5_000);
  });
});
