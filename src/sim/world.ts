import { chooseTradePartner, getTradeIntent, warAppetite } from "../ai/policy";
import { RESOURCE_KEYS, type Country, type EventKind, type Resource, type WorldEvent, type WorldState } from "../model/types";
import { createRng } from "./rng";

const NAMES = ["Aurelia", "Belvar", "Corvin", "Demeria", "Iona", "Karsia", "Tassar", "Veyra"] as const;
const COLORS = ["#72a7ff", "#f17b72", "#68c59f", "#d8b35d", "#ad8cff", "#e18dca", "#5dc1cf", "#d0d36c"] as const;
const BASE_PRICE: Record<Resource, number> = { food: 1.1, energy: 1.8, metals: 2.2, goods: 3.1 };

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 10) / 10;

function addEvent(world: WorldState, kind: EventKind, text: string) {
  const event: WorldEvent = { id: world.nextEventId++, week: world.week, kind, text };
  world.events.unshift(event);
  if (world.events.length > 300) world.events.length = 300;
}

export function createInitialWorld(seed = 1978): WorldState {
  const rng = createRng(seed);
  const countries: Country[] = NAMES.map((name, index) => {
    const population = rng.int(18, 92);
    return {
      id: name.toLowerCase(),
      name,
      color: COLORS[index],
      population,
      treasury: rng.int(130, 360),
      resources: {
        food: rng.int(70, 190),
        energy: rng.int(55, 190),
        metals: rng.int(45, 160),
        goods: rng.int(45, 145),
      },
      production: {
        food: rng.int(7, 18),
        energy: rng.int(5, 18),
        metals: rng.int(4, 14),
        goods: rng.int(4, 13),
      },
      needs: {
        food: population * 0.115,
        energy: population * 0.085,
        metals: population * 0.035,
        goods: population * 0.055,
      },
      military: rng.int(35, 105),
      readiness: rng.int(42, 82),
      stability: rng.int(55, 88),
      policy: {
        risk: rng.int(15, 90),
        expansionism: rng.int(10, 92),
        commerce: rng.int(28, 95),
        diplomacy: rng.int(20, 92),
      },
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

  const world: WorldState = { seed, week: 0, nextEventId: 1, countries, wars: [], events: [] };
  addEvent(world, "world", `Eight sovereign states enter the simulation. Seed ${seed}.`);
  return world;
}

function isAtWar(world: WorldState, a: string, b: string) {
  return world.wars.some((war) => (war.a === a && war.b === b) || (war.a === b && war.b === a));
}

function runEconomy(world: WorldState, rng: ReturnType<typeof createRng>) {
  for (const country of world.countries) {
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

    const taxBase = country.population * 0.024 * (0.6 + country.stability / 125);
    country.treasury += taxBase - country.military * 0.006;
    country.stability = clamp(country.stability + 0.035 - shortagePressure * 0.9);
    country.readiness = clamp(country.readiness - 0.025 + (country.treasury > 0 ? 0.015 : -0.08));

    if (shortagePressure > 0.7 && rng.next() < 0.08) {
      addEvent(world, "economy", `${country.name} is suffering severe shortages; stability falls to ${Math.round(country.stability)}%.`);
    }
  }
}

function runTrade(world: WorldState) {
  for (const buyer of world.countries) {
    const intent = getTradeIntent(buyer);
    if (!intent || buyer.treasury <= 1) continue;
    const seller = chooseTradePartner(world, buyer, intent.resource);
    if (!seller) continue;

    const relation = buyer.relations[seller.id];
    const sellerRelation = seller.relations[buyer.id];
    if (!relation || !sellerRelation) continue;

    const desired = Math.max(4, buyer.needs[intent.resource] * 4);
    const sellerReserve = seller.needs[intent.resource] * 9;
    const available = Math.max(0, seller.resources[intent.resource] - sellerReserve);
    const amount = Math.min(desired, available);
    const price = BASE_PRICE[intent.resource] * amount * (1 + relation.tension / 250);
    if (amount < 2 || price > buyer.treasury) continue;

    buyer.treasury -= price;
    seller.treasury += price;
    buyer.resources[intent.resource] += amount;
    seller.resources[intent.resource] -= amount;
    relation.tradeVolume += price;
    sellerRelation.tradeVolume += price;
    relation.trust = clamp(relation.trust + 0.18);
    sellerRelation.trust = clamp(sellerRelation.trust + 0.18);
    relation.tension = clamp(relation.tension - 0.06);
    sellerRelation.tension = clamp(sellerRelation.tension - 0.06);

    if (world.week % 13 === 0) {
      addEvent(world, "trade", `${buyer.name} buys ${Math.round(amount)} units of ${intent.resource} from ${seller.name}.`);
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
        ar.tension = br.tension = clamp(Math.max(ar.tension, br.tension) + 0.5);
        ar.trust = br.trust = clamp(Math.min(ar.trust, br.trust) - 0.4);
        continue;
      }

      const policyFriction = Math.abs(a.policy.expansionism - b.policy.expansionism) / 2500;
      const militaryFriction = (a.policy.expansionism + b.policy.expansionism) / 1100;
      const noise = (rng.next() - 0.5) * 0.12;
      const tradeCalm = Math.min(0.08, (ar.tradeVolume + br.tradeVolume) / 12000);
      const delta = policyFriction + militaryFriction + noise - tradeCalm;
      ar.tension = clamp(ar.tension + delta);
      br.tension = clamp(br.tension + delta);
      ar.tradeVolume *= 0.992;
      br.tradeVolume *= 0.992;
    }
  }
}

function maybeStartWars(world: WorldState, rng: ReturnType<typeof createRng>) {
  for (const attacker of world.countries) {
    if (world.wars.some((war) => war.a === attacker.id || war.b === attacker.id)) continue;
    const targets = world.countries
      .filter((defender) => defender.id !== attacker.id && !world.wars.some((war) => war.a === defender.id || war.b === defender.id))
      .map((defender) => ({ defender, appetite: warAppetite(attacker, defender) }))
      .sort((a, b) => b.appetite - a.appetite);

    const best = targets[0];
    if (!best || best.appetite < 0.18) continue;
    if (rng.next() > best.appetite * 0.035) continue;

    const defender = best.defender;
    const relationA = attacker.relations[defender.id]!;
    const relationB = defender.relations[attacker.id]!;
    relationA.tension = relationB.tension = 100;
    relationA.trust = relationB.trust = Math.min(relationA.trust, relationB.trust, 5);
    world.wars.push({
      id: `${attacker.id}-${defender.id}-${world.week}`,
      a: attacker.id,
      b: defender.id,
      attacker: attacker.id,
      startWeek: world.week,
      casualtiesA: 0,
      casualtiesB: 0,
    });
    addEvent(world, "war", `${attacker.name} declares war on ${defender.name}.`);
  }
}

function runWars(world: WorldState, rng: ReturnType<typeof createRng>) {
  const ended: string[] = [];
  for (const war of world.wars) {
    const a = world.countries.find((country) => country.id === war.a)!;
    const b = world.countries.find((country) => country.id === war.b)!;
    const powerA = a.military * (0.5 + a.readiness / 100);
    const powerB = b.military * (0.5 + b.readiness / 100);
    const lossA = Math.max(0.05, powerB / Math.max(25, powerA) * (0.22 + rng.next() * 0.35));
    const lossB = Math.max(0.05, powerA / Math.max(25, powerB) * (0.22 + rng.next() * 0.35));

    a.military = Math.max(3, a.military - lossA);
    b.military = Math.max(3, b.military - lossB);
    war.casualtiesA += lossA * 920;
    war.casualtiesB += lossB * 920;
    a.treasury -= powerA * 0.02;
    b.treasury -= powerB * 0.02;
    a.stability = clamp(a.stability - lossA * 0.055);
    b.stability = clamp(b.stability - lossB * 0.055);
    a.readiness = clamp(a.readiness - 0.06);
    b.readiness = clamp(b.readiness - 0.06);

    const duration = world.week - war.startWeek;
    const ratio = a.military / Math.max(1, b.military);
    const exhausted = duration > 20 && (a.stability < 35 || b.stability < 35 || ratio > 2.1 || ratio < 0.48);
    const longWarPeace = duration > 52 && rng.next() < 0.018;
    if (exhausted || longWarPeace) {
      const winner = ratio >= 1 ? a : b;
      const loser = ratio >= 1 ? b : a;
      const reparations = Math.max(0, Math.min(35, loser.treasury * 0.08));
      loser.treasury -= reparations;
      winner.treasury += reparations;
      winner.relations[loser.id]!.tension = 82;
      loser.relations[winner.id]!.tension = 92;
      addEvent(world, "peace", `${winner.name} emerges ahead as ${winner.name} and ${loser.name} sign a peace settlement after ${duration} weeks of war.`);
      ended.push(war.id);
    }
  }
  if (ended.length) world.wars = world.wars.filter((war) => !ended.includes(war.id));
}

export function tickWeek(world: WorldState): WorldState {
  world.week += 1;
  const rng = createRng(world.seed + world.week * 7919);
  runEconomy(world, rng);
  runTrade(world);
  evolveRelations(world, rng);
  runWars(world, rng);
  maybeStartWars(world, rng);

  if (world.week % 52 === 0) {
    const richest = [...world.countries].sort((a, b) => b.treasury - a.treasury)[0]!;
    addEvent(world, "world", `Year ${Math.floor(world.week / 52) + 1} begins. ${richest.name} holds the world's largest treasury.`);
  }
  return world;
}
