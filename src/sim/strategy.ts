import type { Country, TradeRoute, War, WorldState } from "../model/types";
import { findFrontCell, recalculateRouteCapacity } from "./geography";

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 100) / 100;

type RngLike = { next(): number };

export function routeQuality(route: TradeRoute) {
  return route.level * clamp(route.condition, 0, 100) / 100;
}

export function countryLogistics(world: WorldState, countryId: string) {
  const country = world.countries.find((candidate) => candidate.id === countryId);
  const routes = world.geography.routes.filter((route) => route.a === countryId || route.b === countryId);
  if (!routes.length) return 0.55;
  const usable = routes.filter((route) => !route.blockedBy);
  const averageQuality = usable.length
    ? usable.reduce((sum, route) => sum + routeQuality(route), 0) / usable.length
    : 0.25;
  const blockadePenalty = routes.filter((route) => route.blockedBy && route.blockedBy !== countryId).length * 0.08;
  const tradeCompetence = country ? country.government.ministries.trade.competence / 600 : 0;
  const agendaBonus = country ? country.government.agenda.infrastructure / 900 : 0;
  return clamp(0.43 + averageQuality * 0.18 + tradeCompetence + agendaBonus - blockadePenalty, 0.25, 1.4);
}

export function calculateWarSupply(world: WorldState, country: Country, opponentId: string) {
  const foodWeeks = country.resources.food / Math.max(0.1, country.needs.food);
  const energyWeeks = country.resources.energy / Math.max(0.1, country.needs.energy);
  const stock = clamp((foodWeeks + energyWeeks) * 5, 0, 35);
  const fiscal = clamp(country.treasury / Math.max(10, country.population * 2.5), -0.5, 1.2) * 18;
  const logistics = countryLogistics(world, country.id) * 28;
  const landAccess = (world.geography.adjacency[country.id] ?? []).includes(opponentId) ? 10 : -6;
  const defenseExecution = (country.government.ministries.defense.competence - 50) * 0.07 + (country.government.cohesion - 50) * 0.035;
  const preBlockade = clamp(22 + stock + fiscal + logistics + landAccess + defenseExecution, 8, 100);
  // Apply this after the normal cap so a country at supply 100 still suffers an
  // immediate, observable military penalty when a sea corridor is blockaded.
  const directBlockadePenalty = world.geography.routes
    .filter((route) => route.blockedBy && route.blockedBy !== country.id && (route.a === country.id || route.b === country.id))
    .length * 6;
  return clamp(preBlockade - directBlockadePenalty, 8, 100);
}

export function updateWarLogistics(world: WorldState) {
  for (const route of world.geography.routes) route.blockedBy = null;

  const messages: string[] = [];
  const blockadePlans = world.wars.map((war) => {
    const a = world.countries.find((country) => country.id === war.a)!;
    const b = world.countries.find((country) => country.id === war.b)!;
    const provisionalSupplyA = calculateWarSupply(world, a, b.id);
    const provisionalSupplyB = calculateWarSupply(world, b, a.id);
    war.supplyA = provisionalSupplyA;
    war.supplyB = provisionalSupplyB;

    if (!war.frontCellId || world.geography.cells.find((cell) => cell.id === war.frontCellId)?.ownerId === war.attacker) {
      const defenderId = war.attacker === war.a ? war.b : war.a;
      war.frontCellId = findFrontCell(world, war.attacker, defenderId)?.id ?? findFrontCell(world, defenderId, war.attacker)?.id ?? null;
    }

    const powerA = a.military * (0.55 + a.readiness / 100) * (0.65 + provisionalSupplyA / 145);
    const powerB = b.military * (0.55 + b.readiness / 100) * (0.65 + provisionalSupplyB / 145);
    const stronger = powerA >= powerB ? a : b;
    const weaker = powerA >= powerB ? b : a;
    const ratio = Math.max(powerA, powerB) / Math.max(1, Math.min(powerA, powerB));
    war.blockadeRouteIds = [];
    return { war, stronger, weaker, ratio };
  });

  for (const { war, stronger, weaker, ratio } of blockadePlans) {
    const strongerHasPort = world.geography.cities.some((city) => city.countryId === stronger.id && city.port);
    const navalThreshold = 1.36 - stronger.government.ministries.defense.competence / 1000 - stronger.government.agenda.defensePosture / 1500;
    if (!strongerHasPort || ratio < navalThreshold) continue;
    const candidates = world.geography.routes
      .filter((route) => route.mode === "sea" && !route.blockedBy && (route.a === weaker.id || route.b === weaker.id))
      .sort((x, y) => Number(y.chokepoint) - Number(x.chokepoint) || y.capacity - x.capacity);
    const target = candidates[0];
    if (!target) continue;
    target.blockedBy = stronger.id;
    war.blockadeRouteIds.push(target.id);
    if (target.chokepoint) messages.push(`${stronger.name}'s defense ministry orders a blockade of strategic chokepoint ${target.id}, constraining ${weaker.name}'s maritime supply.`);
  }

  for (const war of world.wars) {
    const a = world.countries.find((country) => country.id === war.a)!;
    const b = world.countries.find((country) => country.id === war.b)!;
    war.supplyA = calculateWarSupply(world, a, b.id);
    war.supplyB = calculateWarSupply(world, b, a.id);
  }

  return messages;
}

export function runInfrastructure(world: WorldState, rng: RngLike) {
  const messages: string[] = [];
  for (const route of world.geography.routes) {
    const utilization = route.capacity > 0 ? route.usedThisWeek / route.capacity : 0;
    route.condition = clamp(route.condition - 0.003 - utilization * 0.025, 35, 100);
    recalculateRouteCapacity(route);
  }

  if (world.week % 13 !== 0) return messages;
  for (const country of world.countries) {
    if (country.treasury < country.population * 2.2) continue;
    const tradeMinistry = country.government.ministries.trade;
    const infrastructure = country.government.agenda.infrastructure;
    const decisionChance = clamp(0.10 + country.policy.commerce / 220 + infrastructure / 220 + tradeMinistry.competence / 500, 0.18, 0.92);
    if (rng.next() > decisionChance) continue;
    const candidates = world.geography.routes
      .filter((route) => route.a === country.id || route.b === country.id)
      .filter((route) => route.level < 5 || route.condition < 88)
      .sort((a, b) => routeQuality(a) - routeQuality(b) || b.usedThisWeek - a.usedThisWeek);
    const route = candidates[0];
    if (!route) continue;
    const upgrade = route.condition >= 72 && route.level < 5;
    const executionDiscount = 1 - Math.max(0, tradeMinistry.competence - 50) / 500;
    const cost = (upgrade ? 7 + route.level * 5 : 3.5 + (100 - route.condition) * 0.04) * executionDiscount;
    if (country.treasury < cost + country.population) continue;
    country.treasury -= cost;
    route.condition = clamp(route.condition + (upgrade ? 9 : 18));
    if (upgrade) route.level += 1;
    if (route.mode === "land" && route.level >= 3) route.infrastructure = "rail";
    recalculateRouteCapacity(route);
    messages.push(`${country.name}'s trade ministry invests $${round(cost)}B in ${route.id}, raising it to ${route.infrastructure} level ${route.level} at ${Math.round(route.condition)}% condition.`);
  }
  return messages;
}

export function runAnnualDemography(world: WorldState) {
  if (world.week % 52 !== 0) return [] as string[];
  const messages: string[] = [];

  for (const city of world.geography.cities) {
    const country = world.countries.find((candidate) => candidate.id === city.countryId);
    if (!country) continue;
    const atWar = world.wars.some((war) => war.a === country.id || war.b === country.id);
    const routes = world.geography.routes.filter((route) => route.a === country.id || route.b === country.id);
    const infra = routes.length ? routes.reduce((sum, route) => sum + routeQuality(route), 0) / routes.length : 0.6;
    const governance = (country.government.legitimacy + country.government.cohesion - 100) / 10000;
    const annualGrowth = clamp(
      0.004 + (country.stability - 50) / 4000 + (city.port ? 0.004 : 0) + infra * 0.0015 + governance - (atWar ? 0.018 : 0),
      -0.035,
      0.035,
    );
    const urbanCap = Math.max(1.5, country.population * (city.capital ? 0.42 : city.port ? 0.30 : 0.24));
    city.population = round(Math.min(urbanCap, Math.max(0.35, city.population * (1 + annualGrowth))));
    city.industry = round(clamp(city.industry * (1 + annualGrowth * 0.45 + infra * 0.001), 0.5, 12));
  }

  const sources = [...world.countries]
    .filter((country) => country.stability < 52 || country.government.legitimacy < 35 || world.wars.some((war) => war.a === country.id || war.b === country.id))
    .sort((a, b) => (a.stability + a.government.legitimacy * 0.25) - (b.stability + b.government.legitimacy * 0.25));

  for (const source of sources) {
    const destinations = world.countries
      .filter((target) => target.id !== source.id && target.stability + target.government.legitimacy * 0.2 > source.stability + source.government.legitimacy * 0.2 + 12)
      .filter((target) => world.geography.routes.some((route) => !route.blockedBy && ((route.a === source.id && route.b === target.id) || (route.b === source.id && route.a === target.id))))
      .sort((a, b) => (b.stability + b.government.legitimacy * 0.2) - (a.stability + a.government.legitimacy * 0.2));
    const target = destinations[0];
    if (!target) continue;
    const attractivenessGap = (target.stability + target.government.legitimacy * 0.2) - (source.stability + source.government.legitimacy * 0.2);
    const amount = round(Math.min(0.28, source.population * 0.0018, Math.max(0, attractivenessGap * 0.006)));
    if (amount < 0.02) continue;
    source.population = round(Math.max(4, source.population - amount));
    target.population = round(target.population + amount);
    const sourceCity = world.geography.cities.filter((city) => city.countryId === source.id).sort((a, b) => b.population - a.population)[0];
    const targetCity = world.geography.cities.filter((city) => city.countryId === target.id).sort((a, b) => b.population - a.population)[0];
    if (sourceCity) sourceCity.population = round(Math.max(0.35, sourceCity.population - amount * 0.55));
    if (targetCity) {
      const targetCap = Math.max(1.5, target.population * (targetCity.capital ? 0.42 : targetCity.port ? 0.30 : 0.24));
      targetCity.population = round(Math.min(targetCap, targetCity.population + amount * 0.55));
    }
    messages.push(`${amount.toFixed(2)}M people migrate from ${source.name} to more stable and legitimate ${target.name} through an open transport corridor.`);
  }

  for (const country of world.countries) {
    country.needs.food = round(country.population * 0.115);
    country.needs.energy = round(country.population * 0.085);
    country.needs.metals = round(country.population * 0.035);
    country.needs.goods = round(country.population * 0.055);
  }
  return messages;
}

export function clearWarBlockades(world: WorldState, war: War) {
  for (const routeId of war.blockadeRouteIds) {
    const route = world.geography.routes.find((candidate) => candidate.id === routeId);
    if (route) route.blockedBy = null;
  }
  war.blockadeRouteIds = [];
}
