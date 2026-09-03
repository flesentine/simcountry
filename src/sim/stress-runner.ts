import { isNonAggressionActive, registerTreaty } from "./treaties";
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
let treatyFixtures = 0;
let fulfilledTreatyObligations = 0;
let treatyViolations = 0;
const finalReadiness: number[] = [];
const finalTension: number[] = [];
const finalTreasuries: number[] = [];
const finalCityPopulations: number[] = [];
const finalLegitimacy: number[] = [];
const finalCohesion: number[] = [];
const finalDissent: number[] = [];

for (let seedIndex = 0; seedIndex < SEEDS.length; seedIndex++) {
  const seed = SEEDS[seedIndex]!;
  const world = createInitialWorld(seed);
  const fixtureRoute = world.geography.routes[0]!;
  const fixtureA = world.countries.find((country) => country.id === fixtureRoute.a)!;
  const fixtureB = world.countries.find((country) => country.id === fixtureRoute.b)!;
  const fixture = registerTreaty(world, {
    title: "Stress commerce and credit compact",
    parties: [fixtureA.id, fixtureB.id],
    expiryWeek: 104,
    withdrawalNoticeWeeks: 13,
    clauses: [
      { kind: "preferential_trade", grantorId: fixtureB.id, beneficiaryId: fixtureA.id, discountPct: 5, resource: "goods" },
      { kind: "quota", exporterId: fixtureA.id, importerId: fixtureB.id, resource: "goods", maxUnitsPerWeek: 25 },
      { kind: "loan", creditorId: fixtureA.id, debtorId: fixtureB.id, principal: 4, installment: 1, intervalWeeks: 13, firstPaymentDelayWeeks: 13 },
      { kind: "non_aggression" },
    ],
  });
  invariant(fixture.ok, `seed ${seed}: treaty stress fixture failed to register${fixture.ok ? "" : `: ${fixture.errors.join(", ")}`}`);
  treatyFixtures++;

  for (let week = 0; week < YEARS * 52; week++) {
    tickWeek(world);

    const participants = new Set<string>();
    for (const war of world.wars) {
      invariant(!participants.has(war.a), `seed ${seed} week ${world.week}: ${war.a} entered multiple wars`);
      invariant(!participants.has(war.b), `seed ${seed} week ${world.week}: ${war.b} entered multiple wars`);
      invariant(!getActiveTruce(world, war.a, war.b), `seed ${seed} week ${world.week}: active war overlaps a truce`);
      invariant(!isNonAggressionActive(world, war.a, war.b), `seed ${seed} week ${world.week}: active war overlaps a non-aggression treaty`);
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

    const treatyIds = new Set<string>();
    for (const treaty of world.treaties) {
      invariant(!treatyIds.has(treaty.id), `seed ${seed} week ${world.week}: duplicate treaty id ${treaty.id}`);
      treatyIds.add(treaty.id);
      invariant(treaty.parties.length === 2 && treaty.parties[0] !== treaty.parties[1], `seed ${seed} week ${world.week}: invalid treaty parties`);
      invariant(treaty.parties.every((id) => world.countries.some((country) => country.id === id)), `seed ${seed} week ${world.week}: treaty references missing country`);
      invariant(treaty.status !== "pending" || world.week < treaty.effectiveWeek, `seed ${seed} week ${world.week}: treaty stuck pending after effective date`);
      invariant(treaty.status !== "active" || treaty.expiryWeek === null || world.week < treaty.expiryWeek, `seed ${seed} week ${world.week}: active treaty passed expiry`);
      invariant(treaty.withdrawalEffectiveWeek === null || treaty.status !== "active" || world.week < treaty.withdrawalEffectiveWeek, `seed ${seed} week ${world.week}: active treaty passed withdrawal date`);
      const clauseIds = new Set<string>();
      for (const clause of treaty.clauses) {
        invariant(!clauseIds.has(clause.id), `seed ${seed} week ${world.week}: duplicate treaty clause id ${clause.id}`);
        clauseIds.add(clause.id);
        if (clause.kind === "quota") invariant(clause.usedThisWeek >= 0 && clause.usedThisWeek <= clause.maxUnitsPerWeek + 0.0001, `seed ${seed} week ${world.week}: treaty quota exceeded`);
      }
      for (const obligation of treaty.obligations) {
        invariant(Number.isFinite(obligation.totalAmount) && obligation.totalAmount > 0, `seed ${seed} week ${world.week}: invalid treaty obligation total`);
        invariant(obligation.paidAmount >= 0 && obligation.remainingAmount >= 0, `seed ${seed} week ${world.week}: negative treaty obligation balance`);
        invariant(Math.abs(obligation.paidAmount + obligation.remainingAmount - obligation.totalAmount) <= 0.011, `seed ${seed} week ${world.week}: treaty obligation does not reconcile`);
        invariant(world.countries.some((country) => country.id === obligation.payerId), `seed ${seed} week ${world.week}: obligation payer missing`);
        invariant(world.countries.some((country) => country.id === obligation.payeeId), `seed ${seed} week ${world.week}: obligation payee missing`);
      }
      for (const amount of Object.values(treaty.treasuryEscrow)) invariant(Number.isFinite(amount) && amount >= -0.0001, `seed ${seed} week ${world.week}: invalid treaty escrow`);
    }
    invariant(world.treaties.length < 32, `seed ${seed} week ${world.week}: treaty count exploded`);

    for (const country of world.countries) {
      const government = country.government;
      invariant(Number.isFinite(government.legitimacy) && government.legitimacy >= 0 && government.legitimacy <= 100, `seed ${seed} week ${world.week}: ${country.name} legitimacy out of bounds`);
      invariant(Number.isFinite(government.cohesion) && government.cohesion >= 0 && government.cohesion <= 100, `seed ${seed} week ${world.week}: ${country.name} cohesion out of bounds`);
      invariant(Number.isFinite(government.dissent) && government.dissent >= 0 && government.dissent <= 100, `seed ${seed} week ${world.week}: ${country.name} dissent out of bounds`);
      invariant(Object.values(government.agenda).every((value) => Number.isFinite(value) && value >= 0 && value <= 100), `seed ${seed} week ${world.week}: ${country.name} agenda out of bounds`);
      invariant(government.objectives.length === 3, `seed ${seed} week ${world.week}: ${country.name} lost delegated objectives`);
      invariant(government.objectives.every((objective) => Number.isFinite(objective.progress) && objective.progress >= 0 && objective.progress <= 100), `seed ${seed} week ${world.week}: ${country.name} objective progress invalid`);
    }
  }

  fulfilledTreatyObligations += world.treaties.flatMap((treaty) => treaty.obligations).filter((obligation) => obligation.status === "fulfilled").length;
  treatyViolations += world.treatyViolations.length;

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
    invariant(Object.keys(country.government.ministries).length === 5, `seed ${seed}: ${country.name} ministry count changed`);
    for (const ministry of Object.values(country.government.ministries)) {
      invariant(ministry.competence >= 0 && ministry.competence <= 100, `seed ${seed}: ${country.name} ministry competence invalid`);
      invariant(ministry.influence >= 0 && ministry.influence <= 100, `seed ${seed}: ${country.name} ministry influence invalid`);
      invariant(ministry.loyalty >= 0 && ministry.loyalty <= 100, `seed ${seed}: ${country.name} ministry loyalty invalid`);
    }

    if (country.military <= 3.0001) floorCountries++;
    finalReadiness.push(country.readiness);
    finalTreasuries.push(country.treasury);
    finalLegitimacy.push(country.government.legitimacy);
    finalCohesion.push(country.government.cohesion);
    finalDissent.push(country.government.dissent);
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
const avgLegitimacy = average(finalLegitimacy);
const avgCohesion = average(finalCohesion);
const avgDissent = average(finalDissent);
const summary = {
  worlds: SEEDS.length,
  yearsPerWorld: YEARS,
  simulatedYears: SEEDS.length * YEARS,
  worldsAtMilitaryFloor,
  totalFloorCountries,
  upgradedRoutes,
  finalChokepoints,
  treatyFixtures,
  fulfilledTreatyObligations,
  treatyViolations,
  avgReadiness,
  avgTension,
  maxTreasury,
  maxCityPopulation,
  avgLegitimacy,
  avgCohesion,
  avgDissent,
};

invariant(finalReadiness.length === SEEDS.length * 8, "stress gate did not evaluate all countries");
invariant(treatyFixtures === SEEDS.length, "treaty fixture did not register in every stress world");
invariant(fulfilledTreatyObligations >= SEEDS.length * 0.9, `only ${fulfilledTreatyObligations} treaty obligations fulfilled`);
invariant(worldsAtMilitaryFloor === 0, `${worldsAtMilitaryFloor} worlds collapsed universally to the military floor`);
invariant(totalFloorCountries < SEEDS.length * 2, `${totalFloorCountries} countries ended at the military floor`);
invariant(upgradedRoutes > 0, "no infrastructure upgrades survived to the end of the stress worlds");
invariant(finalChokepoints > 0, "all maritime chokepoints disappeared");
invariant(avgReadiness > 35, `average readiness ${avgReadiness} is too low`);
invariant(avgTension < 70, `average tension ${avgTension} is too high`);
invariant(maxTreasury < 5_000, `maximum treasury ${maxTreasury} exceeds the fiscal ceiling`);
invariant(maxCityPopulation < 200, `maximum city population ${maxCityPopulation} is implausibly high`);
invariant(avgLegitimacy > 18, `average legitimacy ${avgLegitimacy} collapsed`);
invariant(avgCohesion > 18, `average cabinet cohesion ${avgCohesion} collapsed`);
invariant(avgCohesion < 90, `average cabinet cohesion ${avgCohesion} saturated unrealistically`);
invariant(avgDissent < 88, `average cabinet dissent ${avgDissent} is too high`);

console.log(JSON.stringify(summary));