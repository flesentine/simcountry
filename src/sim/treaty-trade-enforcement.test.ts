import { describe, expect, test } from "vitest";
import { chooseTradePartner } from "../ai/policy";
import { getCountryIntelligence } from "./intelligence";
import { createInitialWorld } from "./world";
import { registerTreaty } from "./treaties";

describe("Phase 4.0 treaty trade enforcement", () => {
  test("a treaty sanction deterministically removes the only viable seller", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const seller = world.countries.find((country) => country.id === route.a)!;
    const buyer = world.countries.find((country) => country.id === route.b)!;

    for (const country of world.countries) {
      country.resources.goods = 0;
      if (country.id === buyer.id) continue;
      getCountryIntelligence(world, buyer.id, country.id)!.estimates.goodsExportable = {
        value: 0,
        low: 0,
        high: 0,
        confidence: 92,
        observedWeek: world.week,
      };
    }
    buyer.resources.goods = 0;
    seller.resources.goods = seller.needs.goods * 40;
    getCountryIntelligence(world, buyer.id, seller.id)!.estimates.goodsExportable = {
      value: 500,
      low: 480,
      high: 520,
      confidence: 92,
      observedWeek: world.week,
    };

    const before = chooseTradePartner(world, buyer, "goods");
    expect(before?.seller.id).toBe(seller.id);

    const treaty = registerTreaty(world, {
      title: "Deterministic goods embargo",
      parties: [seller.id, buyer.id],
      clauses: [{ kind: "sanction", imposerId: buyer.id, targetId: seller.id, resource: "goods" }],
    });
    expect(treaty.ok).toBe(true);

    const after = chooseTradePartner(world, buyer, "goods");
    expect(after).toBeNull();
  });
});
