import { describe, expect, test } from "vitest";
import type { WorldState } from "../model/types";
import {
  effectiveIntelConfidence,
  ensureIntelligence,
  getCountryIntelligence,
  intelligenceProfileAge,
} from "./intelligence";
import { createInitialWorld, tickWeek } from "./world";

function truthOnly(world: WorldState) {
  const copy = structuredClone(world) as Partial<WorldState>;
  delete copy.intelligence;
  return copy;
}

describe("Phase 5.0 subjective intelligence", () => {
  test("initial foreign beliefs are deterministic, bounded, and imperfect", () => {
    const a = createInitialWorld(1978);
    const b = createInitialWorld(1978);
    expect(a.intelligence).toEqual(b.intelligence);

    const observer = a.countries[0]!;
    const profiles = a.intelligence.byObserver[observer.id]!;
    expect(Object.keys(profiles)).toHaveLength(a.countries.length - 1);
    expect(profiles[observer.id]).toBeUndefined();

    let imperfect = 0;
    for (const subject of a.countries.filter((country) => country.id !== observer.id)) {
      const profile = profiles[subject.id]!;
      for (const estimate of Object.values(profile.estimates)) {
        expect(Number.isFinite(estimate.value)).toBe(true);
        expect(estimate.low).toBeLessThanOrEqual(estimate.value);
        expect(estimate.high).toBeGreaterThanOrEqual(estimate.value);
        expect(estimate.confidence).toBeGreaterThanOrEqual(20);
        expect(estimate.confidence).toBeLessThanOrEqual(92);
        expect(estimate.observedWeek).toBe(0);
      }
      if (Math.abs(profile.estimates.military.value - subject.military) > 0.05) imperfect++;
    }
    expect(imperfect).toBeGreaterThan(0);
  });

  test("quarterly collection refreshes only part of the foreign picture so beliefs can become stale", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;

    for (let week = 0; week < 13; week++) tickWeek(world);

    const profiles = Object.values(world.intelligence.byObserver[observer.id]!);
    const refreshed = profiles.filter((profile) => profile.estimates.population.observedWeek === 13);
    const stale = profiles.filter((profile) => profile.estimates.population.observedWeek === 0);
    expect(refreshed).toHaveLength(2);
    expect(stale).toHaveLength(5);

    const staleProfile = stale[0]!;
    expect(intelligenceProfileAge(staleProfile, world.week)).toBe(13);
    expect(effectiveIntelConfidence(staleProfile.estimates.military, world.week))
      .toBeLessThan(staleProfile.estimates.military.confidence);
  });

  test("belief state is informational only and cannot alter authoritative history", () => {
    const control = createInitialWorld(77);
    const distorted = createInitialWorld(77);
    const observer = distorted.countries[0]!;
    const subject = distorted.countries[1]!;
    const profile = getCountryIntelligence(distorted, observer.id, subject.id)!;

    for (const estimate of Object.values(profile.estimates)) {
      estimate.value = 999_999;
      estimate.low = 999_000;
      estimate.high = 1_000_000;
      estimate.confidence = 1;
      estimate.observedWeek = -50_000;
    }

    for (let week = 0; week < 52 * 5; week++) {
      tickWeek(control);
      tickWeek(distorted);
    }

    expect(truthOnly(distorted)).toEqual(truthOnly(control));
  });

  test("read-only intelligence lookup never repairs or mutates missing belief state", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    delete (world as Partial<WorldState>).intelligence;
    const before = structuredClone(world);

    expect(getCountryIntelligence(world, observer.id, subject.id)).toBeNull();
    expect(world).toEqual(before);
    expect((world as Partial<WorldState>).intelligence).toBeUndefined();
  });

  test("older serialized worlds rebuild missing intelligence without rewriting truth", () => {
    const world = createInitialWorld(1978);
    for (let week = 0; week < 21; week++) tickWeek(world);
    const before = truthOnly(world);

    delete (world as Partial<WorldState>).intelligence;
    const rebuilt = ensureIntelligence(world);

    expect(Object.keys(rebuilt.byObserver)).toHaveLength(world.countries.length);
    expect(truthOnly(world)).toEqual(before);
    for (const observer of world.countries) {
      expect(Object.keys(rebuilt.byObserver[observer.id]!)).toHaveLength(world.countries.length - 1);
    }
  });
});
