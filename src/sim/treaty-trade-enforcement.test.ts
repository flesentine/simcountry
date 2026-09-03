import { describe, expect, test } from "vitest";
import { chooseTradePartner } from "../ai/policy";
import { createInitialWorld } from "./world";
import { registerTreaty } from "./treaties";

describe("Phase 4.0 treaty trade enforcement", () => {
  test("a treaty sanction deterministically removes the only viable seller", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const seller = world.countries.find((country) => country.id === route.a)!;
    const buyer = world.countries.find((country) => country.id === route.b)!;

    for (const country of world.countries) country.resources.goods = 0;
    buyer.resources.goods = 0;
    seller.resources.goods = seller.needs.goods * 40;

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
