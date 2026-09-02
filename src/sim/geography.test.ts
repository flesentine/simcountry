import { describe, expect, test } from "vitest";
import { chooseTradePartner } from "../ai/policy";
import { RESOURCE_KEYS } from "../model/types";
import { hasStrategicAccess } from "./geography";
import { createInitialWorld, tickWeek } from "./world";

describe("SimCountry phase 1 geography invariants", () => {
  test("the same seed generates the same physical world", () => {
    const a = createInitialWorld(1978);
    const b = createInitialWorld(1978);
    expect(a.geography).toEqual(b.geography);
  });

  test("every country owns territory and has a capital on its own land", () => {
    const world = createInitialWorld(1978);
    for (const country of world.countries) {
      const territory = world.geography.cells.filter((cell) => cell.ownerId === country.id);
      expect(territory.length).toBeGreaterThan(0);
      const capital = world.geography.cities.find((city) => city.countryId === country.id && city.capital);
      expect(capital).toBeDefined();
      const capitalCell = world.geography.cells.find((cell) => cell.id === capital!.cellId);
      expect(capitalCell?.land).toBe(true);
      expect(capitalCell?.ownerId).toBe(country.id);
      expect(RESOURCE_KEYS.every((resource) => Number.isFinite(country.production[resource]) && country.production[resource] > 0)).toBe(true);
    }
  });

  test("land adjacency is symmetric and land routes only connect neighbors", () => {
    const world = createInitialWorld(1978);
    for (const country of world.countries) {
      for (const neighbor of world.geography.adjacency[country.id] ?? []) {
        expect(world.geography.adjacency[neighbor]).toContain(country.id);
      }
    }
    for (const route of world.geography.routes.filter((route) => route.mode === "land")) {
      expect(world.geography.adjacency[route.a]).toContain(route.b);
      expect(world.geography.adjacency[route.b]).toContain(route.a);
    }
  });

  test("sea routes terminate at real ports and trade requires transport access", () => {
    const world = createInitialWorld(1978);
    for (const route of world.geography.routes.filter((route) => route.mode === "sea")) {
      expect(world.geography.cities.find((city) => city.id === route.fromCityId)?.port).toBe(true);
      expect(world.geography.cities.find((city) => city.id === route.toCityId)?.port).toBe(true);
    }

    const buyer = world.countries[0]!;
    for (const resource of RESOURCE_KEYS) buyer.resources[resource] = 0;
    const withRoutes = chooseTradePartner(world, buyer, "food");
    if (withRoutes) expect(withRoutes.route.a === buyer.id || withRoutes.route.b === buyer.id).toBe(true);

    world.geography.routes = [];
    expect(chooseTradePartner(world, buyer, "food")).toBeNull();
  });

  test("route capacity is never exceeded and wars require physical access", () => {
    const world = createInitialWorld(1978);
    let sawTradeUse = false;
    for (let week = 0; week < 52 * 30; week++) {
      tickWeek(world);
      for (const route of world.geography.routes) {
        expect(route.usedThisWeek).toBeGreaterThanOrEqual(0);
        expect(route.usedThisWeek).toBeLessThanOrEqual(route.capacity + 0.0001);
        if (route.usedThisWeek > 0) sawTradeUse = true;
      }
      for (const war of world.wars) expect(hasStrategicAccess(world, war.a, war.b)).toBe(true);
    }
    expect(sawTradeUse).toBe(true);
  });
});
