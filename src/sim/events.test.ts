import { describe, expect, test } from "vitest";
import type { WorldEvent } from "../model/types";
import { eventTextForObserver, recordWorldEvent, visibleWorldEventViews } from "./events";
import { createInitialWorld, tickWeek } from "./world";

describe("Phase 5.7 observer-limited event visibility", () => {
  test("legacy public events remain visible to every observer", () => {
    const event: WorldEvent = {
      id: 1,
      week: 0,
      kind: "world",
      text: "Public event",
    };

    expect(eventTextForObserver(event, "aurelia")).toBe("Public event");
    expect(eventTextForObserver(event, "belvar")).toBe("Public event");
  });

  test("authorized observers see full detail while others receive only sanitized public text", () => {
    const event: WorldEvent = {
      id: 2,
      week: 13,
      kind: "war",
      text: "Aurelia attacks after intelligence assessed Corvin at 31 military.",
      audienceCountryIds: ["aurelia"],
      publicText: "Aurelia attacks Corvin.",
    };

    expect(eventTextForObserver(event, "aurelia")).toContain("intelligence assessed");
    expect(eventTextForObserver(event, "belvar")).toBe("Aurelia attacks Corvin.");
  });

  test("restricted events fail closed when no public text is supplied", () => {
    const event: WorldEvent = {
      id: 3,
      week: 13,
      kind: "world",
      text: "Private intelligence retasking detail.",
      audienceCountryIds: [],
    };

    expect(eventTextForObserver(event, "aurelia")).toBeNull();
    expect(visibleWorldEventViews([event], "aurelia")).toEqual([]);
  });

  test("recording restricted events preserves one authoritative ledger entry", () => {
    const world = createInitialWorld(1978);
    const before = world.events.length;
    const recorded = recordWorldEvent(world, "trade", {
      text: "Full buyer intelligence provenance.",
      audienceCountryIds: ["aurelia"],
      publicText: "Public trade outcome.",
    });

    expect(world.events).toHaveLength(before + 1);
    expect(world.events[0]).toBe(recorded);
    expect(recorded.text).toBe("Full buyer intelligence provenance.");
    expect(eventTextForObserver(recorded, "aurelia")).toBe("Full buyer intelligence provenance.");
    expect(eventTextForObserver(recorded, "belvar")).toBe("Public trade outcome.");
  });

  test("quarterly reconnaissance keeps God-mode detail but sanitizes observer history", () => {
    const world = createInitialWorld(1978);
    for (let week = 0; week < 13; week++) tickWeek(world);

    const event = world.events.find((candidate) => candidate.text.startsWith("Active reconnaissance retasked"));
    expect(event).toBeDefined();
    expect(event!.audienceCountryIds).toEqual([]);
    expect(event!.publicText).toBe("Quarterly intelligence services retask collection priorities.");
    expect(eventTextForObserver(event!, "aurelia")).toBe("Quarterly intelligence services retask collection priorities.");
    expect(event!.text).toContain("Aurelia→");
  });
});
