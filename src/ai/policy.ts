import type { Country, Resource, WorldState } from "../model/types";
import { RESOURCE_KEYS } from "../model/types";

export interface TradeIntent {
  buyerId: string;
  resource: Resource;
  urgency: number;
}

export function getTradeIntent(country: Country): TradeIntent | null {
  let best: TradeIntent | null = null;
  const targetWeeks = 6 + country.policy.commerce / 12.5;
  const urgencyThreshold = 0.34 - country.policy.commerce * 0.0018;

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

export function chooseTradePartner(world: WorldState, buyer: Country, resource: Resource): Country | null {
  const candidates = world.countries
    .filter((seller) => seller.id !== buyer.id && !world.wars.some((war) => [war.a, war.b].includes(buyer.id) && [war.a, war.b].includes(seller.id)))
    .map((seller) => {
      const relation = buyer.relations[seller.id];
      const sellerReserveWeeks = 11 - seller.policy.commerce / 25;
      const surplus = seller.resources[resource] - seller.needs[resource] * sellerReserveWeeks;
      const relationship = relation ? relation.trust - relation.tension * 0.6 : 0;
      const surplusWeight = 0.72 + buyer.policy.commerce / 300;
      const relationshipWeight = 0.35 + buyer.policy.diplomacy / 200;
      const score = surplus * surplusWeight + relationship * relationshipWeight;
      return { seller, surplus, score };
    })
    .filter((entry) => entry.surplus > 8)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.seller ?? null;
}

export function warAppetite(attacker: Country, defender: Country): number {
  const relation = attacker.relations[defender.id];
  if (!relation || attacker.readiness < 22 || attacker.stability < 28) return 0;
  const powerRatio = (attacker.military * (0.6 + attacker.readiness / 100)) /
    Math.max(1, defender.military * (0.6 + defender.readiness / 100));
  const grievance = Math.max(0, relation.tension - relation.trust * 0.35) / 100;
  const confidence = Math.max(0, Math.min(1.5, powerRatio - 0.7));
  const readinessFactor = 0.35 + attacker.readiness / 100 * 0.65;
  return grievance * confidence * (0.25 + attacker.policy.expansionism / 100) *
    (0.3 + attacker.policy.risk / 100) * readinessFactor;
}
