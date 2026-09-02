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
let upgradedRoutes = 0;
let finalChokepoints = 0;
const finalReadiness: number[] = [];
const finalTension: number[] = [];
const finalTreasuries: number[] = [];
const finalCityPopulations: number[] = [];

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
      invariant(Number.isFinite(war.supplyA) && war.supplyA >= 8 && war.supplyA <= 100, `seed ${seed} week ${world.week}: supplyA out of bounds`);
      invariant(Number.isFinite(war.supplyB) && war.supplyB >= 8 && war.supplyB <= 100, `seed ${seed} week ${world.week}: supplyB out of bounds`);
      invariant(Number.isFinite(war.momentum) && war.momentum >= -100 && war.momentum <= 100, `seed ${seed} week ${world.week}: momentum out of bounds`);
      invariant(Boolean(war.frontCellId), `seed ${seed} week ${world.week}: active war lost its physical front`);
      invariant(Boolean(world.geography.cells.find((cell) => cell.id === war.frontCellId)), `seed ${seed} week ${world.week}: missing front cell ${war.frontCellId}`);
      participants.add(war.a);
      participants.add(war.b);
    }

    for (const route of world.geography.routes) {
      invariant(Number.isFinite(route.capacity) && route.capacity > 0, `seed ${seed} week ${world.week}: invalid route capacity`);
      invariant(route.level >= 1 && route.level <= 5, `seed ${seed} week ${world.week}: route level out of bounds`);
      invariant(route.condition >= 35 && route.condition <= 100, `seed ${seed} week ${world.week}: route condition out of bounds`);
      invariant(route.usedThisWeek >= 0 && route.usedThisWeek <= route.capacity + 0.0001, `seed ${seed} week ${world.week}: route capacity exceeded`);
      if (route.blockedBy) invariant(world.countries.some((country) => country.id === route.blockedBy), `seed ${seed} week ${world.week}: invalid blockading country`);
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
    invariant(world.geography.cells.filter((cell) => cell.ownerId === country.id).length >= 4, `seed ${seed}: ${country.name} fell below territorial floor`);

    if (country.military <= 3.0001) floorCountries++;
    finalReadiness.push(country.readiness);
    finalTreasuries.push(country.treasury);
  }

  for (const city of world.geography.cities) {
    const cell = world.geography.cells.find((candidate) => candidate.id === city.cellId);
    invariant(Boolean(cell?.land), `seed ${seed}: ${city.name} left land`);
    invariant(cell?.ownerId === city.countryId, `seed ${seed}: ${city.name} ownership diverged from its cell`);
    invariant(Number.isFinite(city.population) && city.population >= 0.35, `seed ${seed}: ${city.name} population invalid`);
    invariant(Number.isFinite(city.industry) && city.industry >= 0.5 && city.industry <= 12, `seed ${seed}: ${city.name} industry invalid`);
    finalCityPopulations.push(city.population);
  }

  for (const country of world.countries) {
    for (const neighbor of world.geography.adjacency[country.id] ?? []) {
      invariant((world.geography.adjacency[neighbor] ?? []).includes(country.id), `seed ${seed}: asymmetric border ${country.id}/${neighbor}`);
    }
  }
  for (const route of world.geography.routes.filter((route) => route.mode === "land")) {
    invariant((world.geography.adjacency[route.a] ?? []).includes(route.b), `seed ${seed}: stale land route ${route.id}`);
  }

  upgradedRoutes += world.geography.routes.filter((route) => route.level > 1).length;
  finalChokepoints += world.geography.routes.filter((route) => route.chokepoint).length;

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
const maxCityPopulation = Math.max(...finalCityPopulations);
const summary = {
  worlds: SEEDS.length,
  yearsPerWorld: YEARS,
  simulatedYears: SEEDS.length * YEARS,
  worldsAtMilitaryFloor,
  totalFloorCountries,
  upgradedRoutes,
  finalChokepoints,
  avgReadiness,
  avgTension,
  maxTreasury,
  maxCityPopulation,
};

invariant(finalReadiness.length === SEEDS.length * 8, "stress gate did not evaluate all countries");
invariant(worldsAtMilitaryFloor === 0, `${worldsAtMilitaryFloor} worlds collapsed universally to the military floor`);
invariant(totalFloorCountries < SEEDS.length * 2, `${totalFloorCountries} countries ended at the military floor`);
invariant(upgradedRoutes > 0, "no infrastructure upgrades survived to the end of the stress worlds");
invariant(finalChokepoints > 0, "all maritime chokepoints disappeared");
invariant(avgReadiness > 35, `average readiness ${avgReadiness} is too low`);
invariant(avgTension < 70, `average tension ${avgTension} is too high`);
invariant(maxTreasury < 5_000, `maximum treasury ${maxTreasury} exceeds the fiscal ceiling`);
invariant(maxCityPopulation < 200, `maximum city population ${maxCityPopulation} is implausibly high`);

console.log(JSON.stringify(summary));