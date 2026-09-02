import { describe, expect, test } from "vitest";
import { captureBorderRegion, routeRemainingCapacity } from "./geography";
import { calculateWarSupply, runAnnualDemography, runInfrastructure, updateWarLogistics } from "./strategy";
import { createInitialWorld, tickWeek } from "./world";

describe("SimCountry phase 2 strategic geography", () => {
  test("routes begin with bounded infrastructure state and real chokepoints", () => {
    const world = createInitialWorld(1978);
    expect(world.geography.routes.some((route) => route.chokepoint)).toBe(true);
    for (const route of world.geography.routes) {
      expect(route.level).toBeGreaterThanOrEqual(1);
      expect(route.level).toBeLessThanOrEqual(5);
      expect(route.condition).toBeGreaterThanOrEqual(35);
      expect(route.condition).toBeLessThanOrEqual(100);
      expect(route.capacity).toBeGreaterThan(0);
      expect(Number.isFinite(route.baseCapacity)).toBe(true);
      expect(route.blockedBy).toBeNull();
    }
  });

  test("a blockade removes commercial capacity from a route", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes.find((candidate) => candidate.mode === "sea")!;
    expect(routeRemainingCapacity(route)).toBeGreaterThan(0);
    route.blockedBy = route.a;
    expect(routeRemainingCapacity(route)).toBe(0);
  });

  test("an active blockade directly reduces the weaker side's military supply", () => {
    const world = createInitialWorld(1978);
    const seaRoute = world.geography.routes.find((candidate) => candidate.mode === "sea")!;
    const stronger = world.countries.find((country) => country.id === seaRoute.a)!;
    const weaker = world.countries.find((country) => country.id === seaRoute.b)!;
    stronger.military = 220;
    stronger.readiness = 100;
    weaker.military = 3;
    weaker.readiness = 10;
    const supplyBefore = calculateWarSupply(world, weaker, stronger.id);

    world.wars.push({
      id: "blockade-war",
      a: stronger.id,
      b: weaker.id,
      attacker: stronger.id,
      startWeek: 0,
      casualtiesA: 0,
      casualtiesB: 0,
      frontCellId: null,
      supplyA: 70,
      supplyB: 70,
      momentum: 0,
      capturedA: 0,
      capturedB: 0,
      lastCaptureWeek: 0,
      blockadeRouteIds: [],
    });

    updateWarLogistics(world);
    const war = world.wars[0]!;
    expect(war.blockadeRouteIds.length).toBeGreaterThan(0);
    expect(world.geography.routes.some((route) => route.blockedBy === stronger.id)).toBe(true);
    expect(war.supplyB).toBeLessThan(supplyBefore);
  });

  test("countries can upgrade transport infrastructure from treasury", () => {
    const world = createInitialWorld(1978);
    for (const country of world.countries) {
      country.treasury = 2_000;
      country.policy.commerce = 100;
    }
    world.week = 13;
    const before = Math.max(...world.geography.routes.map((route) => route.level));
    const messages = runInfrastructure(world, { next: () => 0 });
    expect(messages.length).toBeGreaterThan(0);
    expect(Math.max(...world.geography.routes.map((route) => route.level))).toBeGreaterThan(before);
    expect(world.geography.routes.every((route) => route.capacity > 0 && route.condition >= 35)).toBe(true);
  });

  test("territorial capture changes ownership without capturing a capital and rebuilds borders", () => {
    const world = createInitialWorld(1978);
    const pair = world.countries.flatMap((country) => (world.geography.adjacency[country.id] ?? []).map((neighbor) => ({ winner: country.id, loser: neighbor })))
      .find(({ loser }) => world.geography.cells.filter((cell) => cell.ownerId === loser).length > 4)!;
    const capitalCells = new Set(world.geography.cities.filter((city) => city.capital).map((city) => city.cellId));
    const winnerBefore = world.geography.cells.filter((cell) => cell.ownerId === pair.winner).length;
    const loserBefore = world.geography.cells.filter((cell) => cell.ownerId === pair.loser).length;
    const result = captureBorderRegion(world, pair.winner, pair.loser);

    expect(result).not.toBeNull();
    expect(capitalCells.has(result!.cell.id)).toBe(false);
    expect(result!.cell.ownerId).toBe(pair.winner);
    expect(world.geography.cells.filter((cell) => cell.ownerId === pair.winner)).toHaveLength(winnerBefore + 1);
    expect(world.geography.cells.filter((cell) => cell.ownerId === pair.loser)).toHaveLength(loserBefore - 1);
    for (const country of world.countries) {
      for (const neighbor of world.geography.adjacency[country.id] ?? []) {
        expect(world.geography.adjacency[neighbor]).toContain(country.id);
      }
    }
    for (const route of world.geography.routes.filter((route) => route.mode === "land")) {
      expect(world.geography.adjacency[route.a]).toContain(route.b);
    }
  });

  test("annual migration preserves total national population while moving people toward stability", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes.find((candidate) => !candidate.blockedBy)!;
    const source = world.countries.find((country) => country.id === route.a)!;
    const target = world.countries.find((country) => country.id === route.b)!;
    source.stability = 20;
    target.stability = 95;
    const totalBefore = world.countries.reduce((sum, country) => sum + country.population, 0);
    const sourceBefore = source.population;
    world.week = 52;
    const messages = runAnnualDemography(world);
    const totalAfter = world.countries.reduce((sum, country) => sum + country.population, 0);

    expect(messages.length).toBeGreaterThan(0);
    expect(source.population).toBeLessThan(sourceBefore);
    expect(Math.abs(totalAfter - totalBefore)).toBeLessThan(0.05);
  });

  test("an active war develops bounded supply and a physical front", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes.find((candidate) => candidate.mode === "land")!;
    world.wars.push({
      id: "test-war",
      a: route.a,
      b: route.b,
      attacker: route.a,
      startWeek: 0,
      casualtiesA: 0,
      casualtiesB: 0,
      frontCellId: null,
      supplyA: 70,
      supplyB: 70,
      momentum: 0,
      capturedA: 0,
      capturedB: 0,
      lastCaptureWeek: 0,
      blockadeRouteIds: [],
    });
    tickWeek(world);
    const war = world.wars.find((candidate) => candidate.id === "test-war");
    expect(war).toBeDefined();
    expect(war!.supplyA).toBeGreaterThanOrEqual(8);
    expect(war!.supplyA).toBeLessThanOrEqual(100);
    expect(war!.supplyB).toBeGreaterThanOrEqual(8);
    expect(war!.supplyB).toBeLessThanOrEqual(100);
    expect(war!.frontCellId).not.toBeNull();
  });

  test("autonomous war declarations never create an offshore placeholder front", () => {
    const world = createInitialWorld(1978);
    let sawWar = false;
    for (let week = 0; week < 52 * 60; week++) {
      tickWeek(world);
      for (const war of world.wars) {
        sawWar = true;
        expect(war.frontCellId).not.toBeNull();
        expect(world.geography.cells.some((cell) => cell.id === war.frontCellId)).toBe(true);
      }
    }
    expect(sawWar).toBe(true);
  }, 30_000);
});