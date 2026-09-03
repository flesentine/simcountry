import type { Country, Resource, TradeRoute, WorldState } from "../model/types";
import { RESOURCE_KEYS } from "../model/types";
import { getBestTradeRoute, routeRemainingCapacity } from "../sim/geography";
import { getTreatyTradePolicy } from "../sim/treaties";

export interface TradeIntent {
  buyerId: string;
  resource: Resource;
  urgency: number;
}

export interface TradePartner {
  seller: Country;
  route: TradeRoute;
}

export function getSellerReserveWeeks(seller: Country) {
  return 11.5 - seller.policy.commerce / 30 - seller.government.agenda.tradeOpenness / 80;
}

export function getTradeIntent(country: Country): TradeIntent | null {
  let best: TradeIntent | null = null;
  const openness = country.government.agenda.tradeOpenness;
  const tradeCompetence = country.government.ministries.trade.competence;
  const targetWeeks = 5.5 + country.policy.commerce / 15 + openness / 40 + tradeCompetence / 180;
  const urgencyThreshold = 0.36 - country.policy.commerce * 0.0013 - openness * 0.0007;

  for (const resource of RESOURCE_KEYS) {
    const target = country.needs[resource] * targetWeeks;
    const shortage = Math.max(0, target - country.resources[resource]);
    const urgency = target > 0 ? shortage / target : 0;
    if (urgency > urgencyThreshold && (!best || urgency > best.urgency)) {
      best = { buyerId: country.id, resource, urgency };
    }
  }
  return best;
}

export function chooseTradePartner(world: WorldState, buyer: Country, resource: Resource): TradePartner | null {
  const tradeAgenda = buyer.government.agenda.tradeOpenness;
  const foreignCompetence = buyer.government.ministries.foreign.competence;
  const candidates = world.countries
    .filter((seller) => seller.id !== buyer.id && !world.wars.some((war) => [war.a, war.b].includes(buyer.id) && [war.a, war.b].includes(seller.id)))
    .map((seller) => {
      const route = getBestTradeRoute(world, buyer.id, seller.id);
      if (!route) return null;
      const treatyPolicy = getTreatyTradePolicy(world, buyer.id, seller.id, resource);
      if (treatyPolicy.blocked || treatyPolicy.quotaRemaining < 2) return null;
      const relation = buyer.relations[seller.id];
      const sellerReserveWeeks = getSellerReserveWeeks(seller);
      const surplus = seller.resources[resource] - seller.needs[resource] * sellerReserveWeeks;
      const relationship = relation ? relation.trust - relation.tension * 0.6 : 0;
      const surplusWeight = 0.68 + buyer.policy.commerce / 350 + tradeAgenda / 500;
      const relationshipWeight = 0.34 + buyer.policy.diplomacy / 230 + foreignCompetence / 600;
      const logisticsPenalty = route.distance * (route.mode === "sea" ? 0.7 : 0.95);
      const capacityBonus = Math.min(16, routeRemainingCapacity(route), treatyPolicy.quotaRemaining) * 0.4;
      const treatyPriceSignal = treatyPolicy.discountPct * 0.12 - treatyPolicy.tariffPct * 0.10;
      const score = surplus * surplusWeight + relationship * relationshipWeight + capacityBonus + treatyPriceSignal - logisticsPenalty;
      return { seller, route, surplus, score };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => entry.surplus > 8)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  return best ? { seller: best.seller, route: best.route } : null;
}

export function warAppetite(attacker: Country, defender: Country): number {
  const relation = attacker.relations[defender.id];
  const government = attacker.government;
  if (!relation || attacker.readiness < 22 || attacker.stability < 28 || government.legitimacy < 20) return 0;
  const powerRatio = (attacker.military * (0.6 + attacker.readiness / 100)) /
    Math.max(1, defender.military * (0.6 + defender.readiness / 100));
  const grievance = Math.max(0, relation.tension - relation.trust * 0.35) / 100;
  const confidence = Math.max(0, Math.min(1.5, powerRatio - 0.7));
  const readinessFactor = 0.35 + attacker.readiness / 100 * 0.65;
  const cabinetSupport = 0.30 + government.agenda.defensePosture / 100 * 1.10;
  const cohesionFactor = 0.94 + government.cohesion / 1000;
  const defenseCompetence = 0.88 + government.ministries.defense.competence / 700;
  const leaderDrive = 0.90 + (government.leader.traits.ambition + government.leader.traits.nationalism) / 1200;
  return grievance * confidence * (0.25 + attacker.policy.expansionism / 100) *
    (0.3 + attacker.policy.risk / 100) * readinessFactor * cabinetSupport * cohesionFactor * defenseCompetence * leaderDrive;
}
