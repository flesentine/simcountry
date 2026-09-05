import type { Country, Resource, TradeRoute, WorldState } from "../model/types";
import { RESOURCE_KEYS } from "../model/types";
import { getBestTradeRoute, routeRemainingCapacity } from "../sim/geography";
import { effectiveIntelConfidence, getCountryIntelligence } from "../sim/intelligence";
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

export interface WarIntelligenceAssessment {
  appetite: number;
  available: boolean;
  perceivedDefenderMilitary: number;
  perceivedDefenderReadiness: number;
  intelligenceConfidence: number;
  intelligenceAgeWeeks: number;
  intelligenceObservedWeek: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function warAppetiteFromPerceivedStrength(
  attacker: Country,
  defenderId: string,
  perceivedDefenderMilitary: number,
  perceivedDefenderReadiness: number,
) {
  const relation = attacker.relations[defenderId];
  const government = attacker.government;
  if (!relation || attacker.readiness < 22 || attacker.stability < 28 || government.legitimacy < 20) return 0;
  const powerRatio = (attacker.military * (0.6 + attacker.readiness / 100)) /
    Math.max(1, perceivedDefenderMilitary * (0.6 + perceivedDefenderReadiness / 100));
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

export function assessWarFromIntelligence(world: WorldState, attacker: Country, defender: Country): WarIntelligenceAssessment {
  const profile = getCountryIntelligence(world, attacker.id, defender.id);
  if (!profile) {
    return {
      appetite: 0,
      available: false,
      perceivedDefenderMilitary: 0,
      perceivedDefenderReadiness: 0,
      intelligenceConfidence: 0,
      intelligenceAgeWeeks: 0,
      intelligenceObservedWeek: world.week,
    };
  }

  const military = profile.estimates.military;
  const readiness = profile.estimates.readiness;
  const militaryConfidence = effectiveIntelConfidence(military, world.week);
  const readinessConfidence = effectiveIntelConfidence(readiness, world.week);
  const intelligenceConfidence = (militaryConfidence + readinessConfidence) / 2;
  const intelligenceObservedWeek = Math.min(military.observedWeek, readiness.observedWeek);
  const intelligenceAgeWeeks = Math.max(0, world.week - intelligenceObservedWeek);

  // Low-confidence intelligence should not be treated as a precise point
  // estimate. Cautious governments hedge toward the observed upper bound;
  // risk-tolerant governments act closer to the central estimate.
  const riskTolerance = clamp01(
    (attacker.policy.risk * 0.65 + attacker.government.leader.traits.riskTolerance * 0.35) / 100,
  );
  const uncertainty = clamp01(1 - intelligenceConfidence / 100);
  const upperBoundShare = uncertainty * (0.35 + (1 - riskTolerance) * 0.65);

  const perceivedDefenderMilitary = Math.max(
    0,
    military.value + Math.max(0, military.high - military.value) * upperBoundShare,
  );
  const perceivedDefenderReadiness = Math.max(
    0,
    Math.min(100, readiness.value + Math.max(0, readiness.high - readiness.value) * upperBoundShare),
  );

  return {
    appetite: warAppetiteFromPerceivedStrength(
      attacker,
      defender.id,
      perceivedDefenderMilitary,
      perceivedDefenderReadiness,
    ),
    available: true,
    perceivedDefenderMilitary,
    perceivedDefenderReadiness,
    intelligenceConfidence,
    intelligenceAgeWeeks,
    intelligenceObservedWeek,
  };
}
