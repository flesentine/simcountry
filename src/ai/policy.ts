import type { Country, Resource, WorldState } from "../model/types";
import { RESOURCE_KEYS } from "../model/types";

export interface TradeIntent {
  buyerId: string;
  resource: Resource;
  urgency: number;
}

export function getTradeIntent(country: Country): TradeIntent | null {
  let best: TradeIntent | null = null;
  for (const resource of RESOURCE_KEYS) {
    const target = country.needs[resource] * 8;
    const shortage = Math.max(0, target - country.resources[resource]);
    const urgency = target > 0 ? shortage / target : 0;
    if (urgency > 0.2 && (!best || urgency > best.urgency)) {
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
      const surplus = seller.resources[resource] - seller.needs[resource] * 10;
      const relationship = relation ? relation.trust - relation.tension * 0.6 : 0;
      const score = surplus + relationship * (0.45 + buyer.policy.diplomacy / 200);
      return { seller, surplus, score };
    })
    .filter((entry) => entry.surplus > 8)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.seller ?? null;
}

export function warAppetite(attacker: Country, defender: Country): number {
  const relation = attacker.relations[defender.id];
  if (!relation) return 0;
  const powerRatio = (attacker.military * (0.6 + attacker.readiness / 100)) /
    Math.max(1, defender.military * (0.6 + defender.readiness / 100));
  const grievance = Math.max(0, relation.tension - relation.trust * 0.35) / 100;
  const confidence = Math.max(0, Math.min(1.5, powerRatio - 0.7));
  return grievance * confidence * (0.25 + attacker.policy.expansionism / 100) * (0.3 + attacker.policy.risk / 100);
}
