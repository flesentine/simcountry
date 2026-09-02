import { createInitialWorld, getActiveTruce, tickWeek } from "./world";

const YEARS = 500;
const SEEDS = Array.from({ length: 100 }, (_, index) => index + 1);
SEEDS[0] = 1978;

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let totalFloorCountries = 0;
let worldsAtMilitaryFloor = 0;
const finalReadiness: number[] = [];
const finalTension: number[] = [];
const finalTreasuries: number[] = [];

for (let seedIndex = 0; seedIndex < SEEDS.length; seedIndex++) {
  const seed = SEEDS[seedIndex]!;
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
    finalReadiness.push(country.readiness);
    finalTreasuries.push(country.treasury);
  }

  for (let i = 0; i < world.countries.length; i++) {
    for (let j = i + 1; j < world.countries.length; j++) {
      const a = world.countries[i]!;
      const b = world.countries[j]!;
      finalTension.push(a.relations[b.id]!.tension);
    }
  }

  totalFloorCountries += floorCountries;
  if (floorCountries === world.countries.length) worldsAtMilitaryFloor++;

  if ((seedIndex + 1) % 20 === 0) {
    console.log(`stress progress: ${seedIndex + 1}/${SEEDS.length} worlds complete`);
  }
}

const avgReadiness = average(finalReadiness);
const avgTension = average(finalTension);
const maxTreasury = Math.max(...finalTreasuries);
const summary = {
  worlds: SEEDS.length,
  yearsPerWorld: YEARS,
  simulatedYears: SEEDS.length * YEARS,
  worldsAtMilitaryFloor,
  totalFloorCountries,
  avgReadiness,
  avgTension,
  maxTreasury,
};

invariant(finalReadiness.length === SEEDS.length * 8, "stress gate did not evaluate all countries");
invariant(worldsAtMilitaryFloor === 0, `${worldsAtMilitaryFloor} worlds collapsed universally to the military floor`);
invariant(totalFloorCountries < SEEDS.length * 2, `${totalFloorCountries} countries ended at the military floor`);
invariant(avgReadiness > 35, `average readiness ${avgReadiness} is too low`);
invariant(avgTension < 70, `average tension ${avgTension} is too high`);
invariant(maxTreasury < 5_000, `maximum treasury ${maxTreasury} exceeds the fiscal ceiling`);

console.log(JSON.stringify(summary));
