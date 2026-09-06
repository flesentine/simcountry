import type { Country, Resource } from "../model/types";

export function getSellerReserveWeeks(seller: Country) {
  return 11.5 - seller.policy.commerce / 30 - seller.government.agenda.tradeOpenness / 80;
}

export function getSellerExportableSurplus(seller: Country, resource: Resource) {
  const reserve = seller.needs[resource] * getSellerReserveWeeks(seller);
  return Math.max(0, seller.resources[resource] - reserve);
}
