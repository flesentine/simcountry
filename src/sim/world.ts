import { chooseTradePartner, getSellerReserveWeeks, getTradeIntent, warAppetite } from "../ai/policy";
import { RESOURCE_KEYS, type Country, type EventKind, type Resource, type Truce, type WorldEvent, type WorldState } from "../model/types";
import { captureBorderRegion, findFrontCell, generateGeography, hasStrategicAccess, resetRouteUsage, routeRemainingCapacity } from "./geography";
import { createGovernment, governmentModifiers, runGovernments } from "./governance";
import { ensureDiplomaticState, getCredibility, nonAggressionBreachPressure } from "./diplomacy";
import { processNegotiations } from "./negotiation";
import { applyGeographicProduction } from "./production";
import { createRng } from "./rng";
import { clearWarBlockades, runAnnualDemography, runInfrastructure, updateWarLogistics } from "./strategy";
import { breachNonAggressionForWar, getActiveTreaties, getTreatyTradePolicy, isNonAggressionActive, processTreaties, recordTreatyTrade, requestTreatyWithdrawal, resetTreatyWeeklyUsage } from "./treaties";

const NAMES = ["Aurelia", "Belvar", "Corvin", "Demeria", "Iona", "Karsia", "Tassar", "Veyra"] as const;
const COLORS = ["#72a7ff", "#f17b72", "#68c59f", "#d8b35d", "#ad8cff", "#e18dca", "#5dc1cf", "#d0d36c"] as const;
const BASE_PRICE: Record<Resource, number> = { food: 1.1, energy: 1.8, metals: 2.2, goods: 3.1 };

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 10) / 10;

function addEvent(world: WorldState, kind: EventKind, text: string) {
  const event: WorldEvent = { id: world.nextEventId++, week: world.week, kind, text };
  world.events.unshift(event);
}

export function createInitialWorld(seed = 1978): WorldState {
  const rng = createRng(seed);
  const countries: Country[] = NAMES.map((name, index) => {
    const population = rng.int(18, 92);
    const treasury = rng.int(130, 360);
    const militaryCapacity = rng.int(35, 105);
    const id = name.toLowerCase();
    const policy = {
      risk: rng.int(15, 90),
      expansionism: rng.int(10, 92),
      commerce: rng.int(28, 95),
      diplomacy: rng.int(20, 92),
    };
    return {
      id,
      name,
      color: COLORS[index],
      population,
      treasury,
      resources: {
        food: rng.int(70, 190),
        energy: rng.int(55, 190),
        metals: rng.int(45, 160),
        goods: rng.int(45, 145),
      },
      production: { food: 0, energy: 0, metals: 0, goods: 0 },
      needs: {
        food: population * 0.115,
        energy: population * 0.085,
        metals: population * 0.035,
        goods: population * 0.055,
      },
      military: militaryCapacity,
      militaryCapacity,
      readiness: rng.int(42, 82),
      stability: rng.int(55, 88),
      policy,
      government: createGovernment(name, id, policy, rng, index),
      relations: {},
    };
  });

  for (const country of countries) {
    for (const other of countries) {
      if (country.id === other.id) continue;
      country.relations[other.id] = {
        trust: rng.int(30, 68),
        tension: rng.int(8, 34),
        tradeVolume: 0,
      };
    }
  }

  const geography = generateGeography(countries, seed);
  applyGeographicProduction(countries, geography);
  const world: WorldState = {
    seed,
    week: 0,
    nextEventId: 1,
    nextTreatyId: 1,
    nextNegotiationId: 1,
    nextProposalId: 1,
    nextDiplomaticMemoryId: 1,
    countries,
    geography,
    wars: [],
    truces: [],
    treaties: [],
    treatyViolations: [],
    negotiations: [],
    proposals: [],
    diplomaticMemories: [],
    diplomaticCredibility: {},
    events: [],
  };
  ensureDiplomaticState(world);
  const landCells = geography.cells.filter((cell) => cell.land).length;
  const ports = geography.cities.filter((city) => city.port).length;
  const chokepoints = geography.routes.filter((route) => route.chokepoint).length;
  addEvent(world, "world", `Eight sovereign states enter a ${geography.width}×${geography.height} physical world with ${landCells} land regions, ${geography.cities.length} cities, ${ports} ports, ${geography.routes.length} transport routes and ${chokepoints} maritime chokepoints. Their leaders and ministries begin governing under competing institutional priorities. Seed ${seed}.`);
  return world;
}

function isAtWar(world: WorldState, a: string, b: string) {
  return world.wars.some((war) => (war.a === a && war.b === b) || (war.a === b && war.b === a));
}

function countryAtWar(world: WorldState, countryId: string) {
  return world.wars.some((war) => war.a === countryId || war.b === countryId);
}

export function getActiveTruce(world: WorldState, a: string, b: string): Truce | null {
  return world.truces.find((truce) => truce.endWeek > world.week &&
    ((truce.a === a && truce.b === b) || (truce.a === b && truce.b === a))) ?? null;
}

function expireTruces(world: WorldState) {
  world.truces = world.truces.filter((truce) => truce.endWeek > world.week);
}

function runEconomy(world: WorldState, rng: ReturnType<typeof createRng>) {
  for (const country of world.countries) {
    const government = governmentModifiers(country);
    let shortagePressure = 0;
    for (const resource of RESOURCE_KEYS) {
      const productivityNoise = 0.93 + rng.next() * 0.14;
      country.resources[resource] += country.production[resource] * productivityNoise;
      const need = country.needs[resource];
      const consumed = Math.min(country.resources[resource], need);
      country.resources[resource] -= consumed;
      const missing = Math.max(0, need - consumed);
      shortagePressure += need > 0 ? missing / need : 0;
      country.resources[resource] = round(Math.max(0, country.resources[resource]));
    }

    const taxBase = country.population * 0.024 * (0.6 + country.stability / 125) * government.taxMultiplier;
    const civilSpending = country.population * 0.018 * government.civilMultiplier;
    const militarySpending = country.military * 0.006 * government.defenseMultiplier;
    const reserveTarget = country.population * 8;
    const reserveInvestment = Math.max(0, country.treasury - reserveTarget) * 0.0015;
    country.treasury += taxBase - militarySpending - civilSpending - reserveInvestment;
    country.treasury = Math.max(-country.population * 5, country.treasury);
    const governanceStability = (government.civilMultiplier - 1) * 0.035 + (government.internalSecurity - 50) * 0.00035;
    country.stability = clamp(country.stability + 0.035 + governanceStability - shortagePressure * 0.9 + (country.treasury < 0 ? -0.025 : 0));

    if (countryAtWar(world, country.id)) {
      country.readiness = clamp(country.readiness - 0.015 + (country.treasury < 0 ? -0.035 : 0));
    } else {
      const readinessTarget = clamp(38 + country.policy.risk * 0.22 + country.policy.expansionism * 0.16 + country.policy.diplomacy * 0.06 + (government.defenseMultiplier - 1) * 8, 40, 84);
      country.readiness = clamp(country.readiness + (readinessTarget - country.readiness) * 0.018 + (country.treasury >= 0 ? 0.01 : -0.06));

      if (country.military < country.militaryCapacity && country.treasury > 0) {
        let recruits = Math.min(
          country.militaryCapacity - country.military,
          (0.05 + country.population * 0.0015 + country.stability * 0.0008) * government.defenseMultiplier,
        );
        const recruitCost = recruits * 0.9;
        if (recruitCost > country.treasury) recruits *= country.treasury / recruitCost;
        country.military = Math.min(country.militaryCapacity, country.military + recruits);
        country.treasury -= recruits * 0.9;
      }
    }

    if (shortagePressure > 0.7 && rng.next() < 0.08) {
      addEvent(world, "economy", `${country.name} is suffering severe shortages; stability falls to ${Math.round(country.stability)}%.`);
    }
  }
}

function runTrade(world: WorldState) {
  for (const buyer of world.countries) {
    const intent = getTradeIntent(buyer);
    if (!intent || buyer.treasury <= 1) continue;
    const partner = chooseTradePartner(world, buyer, intent.resource);
    if (!partner) continue;
    const { seller, route } = partner;

    const relation = buyer.relations[seller.id];
    const sellerRelation = seller.relations[buyer.id];
    if (!relation || !sellerRelation) continue;

    const treatyPolicy = getTreatyTradePolicy(world, buyer.id, seller.id, intent.resource);
    if (treatyPolicy.blocked) continue;
    const desiredWeeks = 1.5 + buyer.policy.commerce / 25;
    const desired = Math.max(4, buyer.needs[intent.resource] * desiredWeeks);
    const sellerReserveWeeks = getSellerReserveWeeks(seller);
    const sellerReserve = seller.needs[intent.resource] * sellerReserveWeeks;
    const available = Math.max(0, seller.resources[intent.resource] - sellerReserve);
    const routeCapacity = routeRemainingCapacity(route);
    const amount = Math.min(desired, available, routeCapacity, treatyPolicy.quotaRemaining);
    const infrastructureEfficiency = 0.72 + route.level * 0.11 + route.condition / 500;
    const logistics = 1 + route.distance / (90 * infrastructureEfficiency) + (route.mode === "sea" ? 0.045 : 0.025);
    const baseTradePrice = BASE_PRICE[intent.resource] * amount * (1 + relation.tension / 250) * logistics;
    const externalPrice = baseTradePrice * Math.max(0.2, 1 - treatyPolicy.discountPct / 100);
    const tariffRevenue = externalPrice * treatyPolicy.tariffPct / 100;
    const grossAffordabilityPrice = externalPrice + tariffRevenue;
    if (amount < 2 || grossAffordabilityPrice > buyer.treasury) continue;

    buyer.treasury -= grossAffordabilityPrice;
    buyer.treasury += tariffRevenue;
    seller.treasury += externalPrice;
    buyer.resources[intent.resource] += amount;
    seller.resources[intent.resource] -= amount;
    route.usedThisWeek += amount;
    recordTreatyTrade(world, buyer.id, seller.id, intent.resource, amount);
    relation.tradeVolume += externalPrice;
    sellerRelation.tradeVolume += externalPrice;
    relation.trust = clamp(relation.trust + 0.18);
    sellerRelation.trust = clamp(sellerRelation.trust + 0.18);
    relation.tension = clamp(relation.tension - 0.06);
    sellerRelation.tension = clamp(sellerRelation.tension - 0.06);

    if (world.week % 13 === 0) {
      const treatyNote = treatyPolicy.tariffPct || treatyPolicy.discountPct || Number.isFinite(treatyPolicy.quotaRemaining)
        ? ` Treaty terms apply (${Math.round(treatyPolicy.tariffPct)}% tariff, ${Math.round(treatyPolicy.discountPct)}% preference).`
        : "";
      addEvent(world, "trade", `${buyer.name} imports ${Math.round(amount)} units of ${intent.resource} from ${seller.name} via a level-${route.level} ${route.infrastructure} corridor (${Math.round(route.usedThisWeek)}/${Math.round(route.capacity)} capacity used).${treatyNote}`);
    }
  }
}

function evolveRelations(world: WorldState, rng: ReturnType<typeof createRng>) {
  for (let i = 0; i < world.countries.length; i++) {
    for (let j = i + 1; j < world.countries.length; j++) {
      const a = world.countries[i]!;
      const b = world.countries[j]!;
      const ar = a.relations[b.id]!;
      const br = b.relations[a.id]!;
      if (isAtWar(world, a.id, b.id)) {
        ar.tension = br.tension = clamp(Math.max(ar.tension, br.tension) + 0.35);
        ar.trust = br.trust = clamp(Math.min(ar.trust, br.trust) - 0.25);
        continue;
      }

      const policyFriction = Math.abs(a.policy.expansionism - b.policy.expansionism) * 0.22;
      const militaryFriction = (a.policy.expansionism + b.policy.expansionism) * 0.16;
      const diplomaticCalm = (a.policy.diplomacy + b.policy.diplomacy) * 0.06;
      const tradeCalm = Math.min(12, (ar.tradeVolume + br.tradeVolume) / 300);
      let tensionTarget = clamp(26 + policyFriction + militaryFriction - diplomaticCalm - tradeCalm, 8, 68);
      const truce = getActiveTruce(world, a.id, b.id);
      if (truce) tensionTarget = Math.max(tensionTarget, 43);

      const tensionNoise = (rng.next() - 0.5) * 0.08;
      ar.tension = clamp(ar.tension + (tensionTarget - ar.tension) * 0.008 + tensionNoise);
      br.tension = clamp(br.tension + (tensionTarget - br.tension) * 0.008 + tensionNoise);

      let trustTarget = clamp(54 + (a.policy.diplomacy + b.policy.diplomacy) * 0.08 + tradeCalm * 0.8 - tensionTarget * 0.58, 8, 78);
      if (truce) trustTarget = Math.min(trustTarget, 34);
      const trustNoise = (rng.next() - 0.5) * 0.04;
      ar.trust = clamp(ar.trust + (trustTarget - ar.trust) * 0.004 + trustNoise);
      br.trust = clamp(br.trust + (trustTarget - br.trust) * 0.004 + trustNoise);

      ar.tradeVolume *= 0.992;
      br.tradeVolume *= 0.992;
    }
  }
}

function enforceStateBounds(world: WorldState) {
  for (const country of world.countries) {
    country.treasury = Math.max(-country.population * 5, country.treasury);
    country.military = Math.max(3, Math.min(country.militaryCapacity, country.military));
    country.readiness = clamp(country.readiness);
    country.stability = clamp(country.stability);
    country.population = Math.max(4, country.population);
    country.government.legitimacy = clamp(country.government.legitimacy);
    country.government.cohesion = clamp(country.government.cohesion);
    country.government.dissent = clamp(country.government.dissent);
  }
}

function considerTreatyWithdrawals(world: WorldState, rng: ReturnType<typeof createRng>) {
  const messages: string[] = [];
  if (world.week % 13 !== 0) return messages;

  for (const country of world.countries) {
    const active = getActiveTreaties(world, country.id)
      .filter((treaty) => treaty.withdrawalRequestedBy === null)
      .sort((a, b) => a.signedWeek - b.signedWeek);
    for (const treaty of active) {
      const counterpartId = treaty.parties.find((id) => id !== country.id);
      if (!counterpartId) continue;
      const counterpart = world.countries.find((candidate) => candidate.id === counterpartId);
      const relation = country.relations[counterpartId];
      if (!counterpart || !relation) continue;

      const credibility = getCredibility(world, country.id, counterpartId);
      const pressure = clamp(
        (50 - credibility) * 0.62
          + relation.tension * 0.30
          + country.policy.expansionism * 0.08
          - country.policy.diplomacy * 0.13
          - country.government.agenda.diplomaticEngagement * 0.11,
        0,
        100,
      );
      if (credibility >= 32 || pressure < 28) continue;
      const chance = clamp((pressure - 24) / 180, 0.015, 0.11);
      if (rng.next() > chance) continue;

      const result = requestTreatyWithdrawal(world, treaty.id, country.id);
      if (result.ok) {
        messages.push(`${country.name} gives lawful withdrawal notice from ${treaty.title} after confidence in ${counterpart.name}'s reliability falls to ${Math.round(credibility)}.`);
        break;
      }
    }
  }
  return messages;
}

function maybeStartWars(world: WorldState, rng: ReturnType<typeof createRng>) {
  for (const attacker of world.countries) {
    if (countryAtWar(world, attacker.id)) continue;
    const targets = world.countries
      .filter((defender) => defender.id !== attacker.id && !countryAtWar(world, defender.id) && !getActiveTruce(world, attacker.id, defender.id) && hasStrategicAccess(world, attacker.id, defender.id))
      .map((defender) => {
        const nonAggression = isNonAggressionActive(world, attacker.id, defender.id);
        const breachPressure = nonAggression ? nonAggressionBreachPressure(world, attacker, defender) : 100;
        const breachFactor = nonAggression ? clamp((breachPressure - 52) / 48, 0.12, 0.72) : 1;
        return {
          defender,
          nonAggression,
          breachPressure,
          appetite: warAppetite(attacker, defender) * breachFactor,
        };
      })
      .filter((candidate) => !candidate.nonAggression || candidate.breachPressure >= 68)
      .sort((a, b) => b.appetite - a.appetite);

    const best = targets[0];
    if (!best || best.appetite < 0.18) continue;
    if (rng.next() > best.appetite * 0.035) continue;

    const defender = best.defender;
    if (best.nonAggression) {
      for (const message of breachNonAggressionForWar(world, attacker.id, defender.id)) addEvent(world, "diplomacy", message);
    }
    const relationA = attacker.relations[defender.id]!;
    const relationB = defender.relations[attacker.id]!;
    relationA.tension = relationB.tension = 100;
    relationA.trust = relationB.trust = Math.min(relationA.trust, relationB.trust, 5);
    const front = findFrontCell(world, attacker.id, defender.id);
    world.wars.push({
      id: `${attacker.id}-${defender.id}-${world.week}`,
      a: attacker.id,
      b: defender.id,
      attacker: attacker.id,
      startWeek: world.week,
      casualtiesA: 0,
      casualtiesB: 0,
      frontCellId: front?.id ?? null,
      supplyA: 70,
      supplyB: 70,
      momentum: 0,
      capturedA: 0,
      capturedB: 0,
      lastCaptureWeek: world.week,
      blockadeRouteIds: [],
    });
    addEvent(world, "war", `${attacker.name}'s government authorizes war on ${defender.name} across a viable ${world.geography.adjacency[attacker.id]?.includes(defender.id) ? "land frontier" : "maritime approach"}; the first operational front is ${front?.id ?? "offshore"}.`);
  }
}

function runWars(world: WorldState, rng: ReturnType<typeof createRng>) {
  const ended: string[] = [];
  for (const war of world.wars) {
    const a = world.countries.find((country) => country.id === war.a)!;
    const b = world.countries.find((country) => country.id === war.b)!;
    const supplyFactorA = 0.62 + war.supplyA / 145;
    const supplyFactorB = 0.62 + war.supplyB / 145;
    const powerA = a.military * (0.5 + a.readiness / 100) * supplyFactorA;
    const powerB = b.military * (0.5 + b.readiness / 100) * supplyFactorB;
    const lossA = Math.max(0.04, powerB / Math.max(25, powerA) * (0.18 + rng.next() * 0.30) * (1.15 - war.supplyA / 250));
    const lossB = Math.max(0.04, powerA / Math.max(25, powerB) * (0.18 + rng.next() * 0.30) * (1.15 - war.supplyB / 250));

    a.military = Math.max(3, a.military - lossA);
    b.military = Math.max(3, b.military - lossB);
    war.casualtiesA += lossA * 920;
    war.casualtiesB += lossB * 920;
    a.treasury -= powerA * 0.016;
    b.treasury -= powerB * 0.016;
    a.stability = clamp(a.stability - lossA * 0.05);
    b.stability = clamp(b.stability - lossB * 0.05);
    a.readiness = clamp(a.readiness - 0.045 - (war.supplyA < 35 ? 0.035 : 0));
    b.readiness = clamp(b.readiness - 0.045 - (war.supplyB < 35 ? 0.035 : 0));

    const battlefieldEdge = (powerA - powerB) / Math.max(1, powerA + powerB);
    war.momentum = clamp(war.momentum + battlefieldEdge * 12 + (rng.next() - 0.5) * 1.4, -100, 100);
    const duration = world.week - war.startWeek;

    if (duration > 8 && world.week - war.lastCaptureWeek >= 8 && Math.abs(war.momentum) > 12) {
      const winner = war.momentum > 0 ? a : b;
      const loser = war.momentum > 0 ? b : a;
      const captureChance = clamp((Math.abs(war.momentum) - 8) / 95 + Math.abs(battlefieldEdge) * 0.28, 0.06, 0.38);
      if (rng.next() < captureChance) {
        const result = captureBorderRegion(world, winner.id, loser.id, war.frontCellId);
        if (result) {
          if (winner.id === war.a) war.capturedA += 1;
          else war.capturedB += 1;
          war.lastCaptureWeek = world.week;
          war.momentum *= 0.58;
          loser.stability = clamp(loser.stability - 0.45);
          winner.stability = clamp(winner.stability + 0.12);
          applyGeographicProduction(world.countries, world.geography);
          war.frontCellId = findFrontCell(world, winner.id, loser.id)?.id ?? findFrontCell(world, loser.id, winner.id)?.id ?? null;
          addEvent(world, "war", `${winner.name} captures region ${result.cell.id} from ${loser.name}${result.city ? `, including ${result.city.name}` : ""}. Borders and transport corridors are recalculated around the new front.`);
        }
      }
    }

    const ratio = a.military / Math.max(1, b.military);
    const exhausted = duration > 20 && (a.stability < 35 || b.stability < 35 || ratio > 2.1 || ratio < 0.48 || a.readiness < 18 || b.readiness < 18 || war.supplyA < 14 || war.supplyB < 14);
    const longWarPeace = duration > 52 && rng.next() < 0.018;
    const lostAccess = !hasStrategicAccess(world, war.a, war.b);
    if (exhausted || longWarPeace || lostAccess) {
      const winner = (a.military * supplyFactorA) >= (b.military * supplyFactorB) ? a : b;
      const loser = winner.id === a.id ? b : a;
      const reparations = Math.max(0, Math.min(35, loser.treasury * 0.08));
      loser.treasury -= reparations;
      winner.treasury += reparations;
      winner.relations[loser.id]!.tension = 62;
      loser.relations[winner.id]!.tension = 72;
      winner.relations[loser.id]!.trust = Math.min(winner.relations[loser.id]!.trust, 18);
      loser.relations[winner.id]!.trust = Math.min(loser.relations[winner.id]!.trust, 14);
      clearWarBlockades(world, war);

      const truceWeeks = 104 + Math.min(156, Math.floor(duration * 2));
      world.truces.push({
        id: `${war.id}-truce`,
        a: war.a,
        b: war.b,
        startWeek: world.week,
        endWeek: world.week + truceWeeks,
      });
      addEvent(world, "peace", `${winner.name} emerges ahead as ${winner.name} and ${loser.name} sign a peace settlement and ${truceWeeks}-week truce after ${duration} weeks of war. Territorial changes remain in force.`);
      ended.push(war.id);
    }
  }
  if (ended.length) world.wars = world.wars.filter((war) => !ended.includes(war.id));
}

export function tickWeek(world: WorldState): WorldState {
  world.week += 1;
  ensureDiplomaticState(world);
  expireTruces(world);
  resetRouteUsage(world);
  resetTreatyWeeklyUsage(world);
  const rng = createRng(world.seed + world.week * 7919);

  for (const message of processTreaties(world)) addEvent(world, "diplomacy", message);
  for (const message of runGovernments(world, rng)) addEvent(world, "politics", message);
  for (const message of considerTreatyWithdrawals(world, rng)) addEvent(world, "diplomacy", message);
  for (const message of processNegotiations(world, rng)) addEvent(world, "diplomacy", message);
  runEconomy(world, rng);

  const blockadeMessages = updateWarLogistics(world);
  if (world.week % 13 === 0) for (const message of blockadeMessages) addEvent(world, "war", message);

  runTrade(world);
  for (const message of runInfrastructure(world, rng)) addEvent(world, "economy", message);
  evolveRelations(world, rng);
  runWars(world, rng);
  maybeStartWars(world, rng);

  const demographyMessages = runAnnualDemography(world);
  if (demographyMessages.length) {
    applyGeographicProduction(world.countries, world.geography);
    for (const message of demographyMessages) addEvent(world, "politics", message);
  }

  enforceStateBounds(world);

  if (world.week % 52 === 0) {
    const richest = [...world.countries].sort((a, b) => b.treasury - a.treasury)[0]!;
    const busiest = [...world.geography.routes].sort((a, b) => b.usedThisWeek - a.usedThisWeek)[0];
    const highestInfra = [...world.geography.routes].sort((a, b) => b.level - a.level || b.condition - a.condition)[0];
    const blockades = world.geography.routes.filter((route) => route.blockedBy).length;
    const activeTreaties = world.treaties.filter((treaty) => treaty.status === "active").length;
    const openNegotiations = world.negotiations.filter((negotiation) => negotiation.status === "open").length;
    const routeNote = busiest && busiest.usedThisWeek > 0 ? ` The busiest route moved ${Math.round(busiest.usedThisWeek)} units.` : "";
    const infraNote = highestInfra ? ` Top infrastructure is level ${highestInfra.level} ${highestInfra.infrastructure}.` : "";
    const treatyNote = `${activeTreaties} ${activeTreaties === 1 ? "treaty is" : "treaties are"} active; ${openNegotiations} negotiation${openNegotiations === 1 ? " is" : "s are"} open.`;
    addEvent(world, "world", `Year ${Math.floor(world.week / 52) + 1} begins. ${richest.name} holds the world's largest treasury.${routeNote}${infraNote} ${blockades} route${blockades === 1 ? " is" : "s are"} under blockade; ${treatyNote}`);
  }
  return world;
}
