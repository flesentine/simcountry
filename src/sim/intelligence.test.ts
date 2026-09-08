import { describe, expect, test } from "vitest";
import type { Negotiation, Proposal, WorldState } from "../model/types";
import {
  collectCountryIntelligence,
  collectSecretNegotiationIntelligence,
  collectSecretTreatyIntelligence,
  effectiveIntelConfidence,
  effectiveSecretNegotiationConfidence,
  effectiveSecretTreatyConfidence,
  ensureIntelligence,
  getCountryIntelligence,
  getSecretNegotiationIntelligence,
  getSecretTreatyIntelligence,
  intelligenceProfileAge,
  militaryDeceptionObservationBias,
  militaryDeceptionPostureFor,
  secretNegotiationDiscoveryChance,
  secretTreatyDiscoveryChance,
  selectReconTargetFromBelief,
  updateIntelligence,
} from "./intelligence";
import { getSellerExportableSurplus } from "./trade";
import { registerTreaty } from "./treaties";
import { createInitialWorld, tickWeek } from "./world";

function truthOnly(world: WorldState) {
  const copy = structuredClone(world) as Partial<WorldState>;
  delete copy.intelligence;
  return copy;
}

function addSecretNegotiationFixture(world: WorldState, subjectId: string, partnerId: string) {
  const sequence = world.negotiations.length + 1;
  const negotiationId = `negotiation-test-${sequence}`;
  const proposalId = `proposal-test-${sequence}`;
  const subject = world.countries.find((country) => country.id === subjectId)!;
  const partner = world.countries.find((country) => country.id === partnerId)!;
  const title = `${subject.name}–${partner.name} Confidential Security Protocol`;
  const proposal: Proposal = {
    id: proposalId,
    negotiationId,
    round: 1,
    proposerId: subjectId,
    recipientId: partnerId,
    motive: "security",
    createdWeek: world.week,
    expiresWeek: world.week + 12,
    responseToProposalId: null,
    draft: {
      title,
      parties: [subjectId, partnerId],
      visibility: "secret",
      effectiveWeek: world.week + 8,
      expiryWeek: world.week + 208,
      withdrawalNoticeWeeks: 26,
      clauses: [{ kind: "non_aggression" }],
    },
    status: "pending",
    decisionReason: null,
    evaluations: [],
  };
  const negotiation: Negotiation = {
    id: negotiationId,
    parties: [subjectId, partnerId],
    visibility: "secret",
    initiatorId: subjectId,
    motive: "security",
    status: "open",
    startedWeek: world.week,
    lastActionWeek: world.week,
    cooldownUntilWeek: 0,
    currentProposalId: proposalId,
    proposalIds: [proposalId],
    maxRounds: 3,
    outcomeTreatyId: null,
    terminalReason: null,
  };
  world.proposals.push(proposal);
  world.negotiations.push(negotiation);
  return { negotiation, proposal };
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
    let imperfectExportability = 0;
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
      if (Math.abs(profile.estimates.foodExportable.value - getSellerExportableSurplus(subject, "food")) > 0.05) {
        imperfectExportability++;
      }
    }
    expect(imperfect).toBeGreaterThan(0);
    expect(imperfectExportability).toBeGreaterThan(0);
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

  test("active reconnaissance replaces one routine refresh slot and improves collection confidence", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    world.week = 13;

    const target = selectReconTargetFromBelief(world, observer);
    expect(target).not.toBeNull();
    const before = getCountryIntelligence(world, observer.id, target!.subjectId)!;
    const beforeConfidence = before.estimates.military.confidence;

    const messages = updateIntelligence(world);
    const assignment = world.intelligence.reconByObserver[observer.id];
    expect(assignment).not.toBeNull();
    expect(assignment!.subjectId).toBe(target!.subjectId);
    expect(assignment!.assignedWeek).toBe(13);

    const profiles = Object.values(world.intelligence.byObserver[observer.id]!);
    const refreshed = profiles.filter((profile) => profile.estimates.population.observedWeek === 13);
    expect(refreshed).toHaveLength(2);

    const reconProfile = getCountryIntelligence(world, observer.id, target!.subjectId)!;
    expect(reconProfile.collectionMethod).toBe("recon");
    expect(reconProfile.estimates.military.confidence).toBeGreaterThan(beforeConfidence);
    expect(refreshed.filter((profile) => profile.collectionMethod === "routine")).toHaveLength(1);
    expect(messages.join(" ")).toContain("Active reconnaissance retasked");
  });

  test("recon target selection follows stored beliefs rather than hidden foreign truth", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    world.week = 39;
    const foreign = world.countries.filter((country) => country.id !== observer.id);
    const priority = foreign[2]!;

    for (const subject of foreign) {
      const profile = getCountryIntelligence(world, observer.id, subject.id)!;
      for (const estimate of Object.values(profile.estimates)) {
        estimate.confidence = subject.id === priority.id ? 20 : 92;
        estimate.observedWeek = subject.id === priority.id ? 0 : 38;
      }
      observer.relations[subject.id]!.tension = subject.id === priority.id ? 100 : 0;
    }

    const before = selectReconTargetFromBelief(world, observer);
    expect(before?.subjectId).toBe(priority.id);

    for (const subject of foreign) {
      subject.population = subject.id === priority.id ? 10_000 : 1;
      subject.treasury = subject.id === priority.id ? 100_000 : -100_000;
      subject.military = subject.id === priority.id ? 1 : 10_000;
      subject.readiness = subject.id === priority.id ? 0 : 100;
      subject.stability = subject.id === priority.id ? 0 : 100;
      for (const resource of ["food", "energy", "metals", "goods"] as const) {
        subject.resources[resource] = subject.id === priority.id ? 0 : 100_000;
        subject.needs[resource] = subject.id === priority.id ? 100_000 : 0.1;
      }
    }

    expect(selectReconTargetFromBelief(world, observer)).toEqual(before);
  });

  test("legacy intelligence repairs missing reconnaissance state without rewriting beliefs", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const before = structuredClone(getCountryIntelligence(world, observer.id, subject.id));
    delete (world.intelligence as Partial<typeof world.intelligence>).reconByObserver;

    ensureIntelligence(world);

    expect(world.intelligence.reconByObserver).toBeDefined();
    expect(world.intelligence.reconByObserver[observer.id]).toBeNull();
    expect(getCountryIntelligence(world, observer.id, subject.id)).toEqual(before);
  });

  test("secret treaty truth cannot influence reconnaissance target selection", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    world.week = 39;
    const foreign = world.countries.filter((country) => country.id !== observer.id);
    const target = foreign[2]!;

    for (const subject of foreign) {
      const profile = getCountryIntelligence(world, observer.id, subject.id)!;
      for (const estimate of Object.values(profile.estimates)) {
        estimate.confidence = subject.id === target.id ? 20 : 92;
        estimate.observedWeek = subject.id === target.id ? 0 : 38;
      }
      observer.relations[subject.id]!.tension = subject.id === target.id ? 100 : 0;
    }

    const before = selectReconTargetFromBelief(world, observer);
    expect(before?.subjectId).toBe(target.id);

    for (let index = 0; index < foreign.length - 1; index++) {
      const a = foreign[index]!;
      const b = foreign[index + 1]!;
      const result = registerTreaty(world, {
        title: `Hidden pact ${index}`,
        parties: [a.id, b.id],
        visibility: "secret",
        clauses: [{ kind: "non_aggression" }],
      });
      expect(result.ok).toBe(true);
    }

    expect(selectReconTargetFromBelief(world, observer)).toEqual(before);
  });

  test("secret treaty discovery chance does not inspect target hidden military or economic truth", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const partner = world.countries[2]!;
    const result = registerTreaty(world, {
      title: "Hidden security channel",
      parties: [subject.id, partner.id],
      visibility: "secret",
      clauses: [{ kind: "non_aggression" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    observer.government.ministries.foreign.competence = 88;
    observer.policy.diplomacy = 82;
    const before = secretTreatyDiscoveryChance(world, observer, subject, result.treaty);

    subject.population = 10_000;
    subject.treasury = -100_000;
    subject.military = 50_000;
    subject.readiness = 100;
    subject.stability = 0;
    for (const resource of ["food", "energy", "metals", "goods"] as const) {
      subject.resources[resource] = 100_000;
      subject.needs[resource] = 0.1;
    }

    expect(secretTreatyDiscoveryChance(world, observer, subject, result.treaty)).toBe(before);
  });

  test("active recon discovery stores a staleable treaty snapshot instead of a live treaty pointer", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const partner = world.countries[2]!;
    observer.government.ministries.foreign.competence = 100;
    observer.policy.diplomacy = 100;

    const result = registerTreaty(world, {
      title: "Hidden security channel",
      parties: [subject.id, partner.id],
      visibility: "secret",
      clauses: [{ kind: "non_aggression" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let discovered = false;
    for (let week = 13; week <= 13 * 80 && !discovered; week += 13) {
      world.week = week;
      discovered = collectSecretTreatyIntelligence(world, observer, subject, week).length > 0;
    }
    expect(discovered).toBe(true);

    const initial = getSecretTreatyIntelligence(world, observer.id).find((intel) => intel.treatyId === result.treaty.id)!;
    expect(initial).toBeDefined();
    expect(initial.status).toBe("active");
    expect(initial.sourceSubjectId).toBe(subject.id);
    expect(initial.discoveredWeek).toBe(initial.lastConfirmedWeek);

    result.treaty.status = "expired";
    result.treaty.terminalReason = "expiry";
    world.week = initial.lastConfirmedWeek + 52;

    const stale = getSecretTreatyIntelligence(world, observer.id).find((intel) => intel.treatyId === result.treaty.id)!;
    expect(stale.status).toBe("active");
    expect(stale.lastConfirmedWeek).toBe(initial.lastConfirmedWeek);
    expect(effectiveSecretTreatyConfidence(stale, world.week)).toBeLessThan(stale.confidence);

    let reconfirmed = false;
    const reconfirmStart = world.week + 13;
    const reconfirmDeadline = world.week + 13 * 80;
    for (let week = reconfirmStart; week <= reconfirmDeadline && !reconfirmed; week += 13) {
      world.week = week;
      collectSecretTreatyIntelligence(world, observer, subject, week);
      const refreshed = getSecretTreatyIntelligence(world, observer.id).find((intel) => intel.treatyId === result.treaty.id)!;
      reconfirmed = refreshed.lastConfirmedWeek === week && refreshed.status === "expired";
    }
    expect(reconfirmed).toBe(true);
  });

  test("legacy intelligence repairs secret-treaty knowledge state without inventing discoveries", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const before = structuredClone(getCountryIntelligence(world, observer.id, subject.id));
    delete (world.intelligence as Partial<typeof world.intelligence>).secretTreatiesByObserver;

    ensureIntelligence(world);

    expect(world.intelligence.secretTreatiesByObserver).toBeDefined();
    expect(world.intelligence.secretTreatiesByObserver[observer.id]).toEqual({});
    expect(getCountryIntelligence(world, observer.id, subject.id)).toEqual(before);
  });

  test("secret negotiation truth cannot influence reconnaissance target selection", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    world.week = 39;
    const foreign = world.countries.filter((country) => country.id !== observer.id);
    const target = foreign[2]!;

    for (const subject of foreign) {
      const profile = getCountryIntelligence(world, observer.id, subject.id)!;
      for (const estimate of Object.values(profile.estimates)) {
        estimate.confidence = subject.id === target.id ? 20 : 92;
        estimate.observedWeek = subject.id === target.id ? 0 : 38;
      }
      observer.relations[subject.id]!.tension = subject.id === target.id ? 100 : 0;
    }

    const before = selectReconTargetFromBelief(world, observer);
    expect(before?.subjectId).toBe(target.id);

    for (let index = 0; index < foreign.length - 1; index++) {
      addSecretNegotiationFixture(world, foreign[index]!.id, foreign[index + 1]!.id);
    }

    expect(selectReconTargetFromBelief(world, observer)).toEqual(before);
  });

  test("secret negotiation discovery chance does not inspect target hidden military or economic truth", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const partner = world.countries[2]!;
    const { negotiation } = addSecretNegotiationFixture(world, subject.id, partner.id);
    observer.government.ministries.foreign.competence = 88;
    observer.policy.diplomacy = 82;

    const before = secretNegotiationDiscoveryChance(world, observer, subject, negotiation);

    subject.population = 10_000;
    subject.treasury = -100_000;
    subject.military = 50_000;
    subject.readiness = 100;
    subject.stability = 0;
    for (const resource of ["food", "energy", "metals", "goods"] as const) {
      subject.resources[resource] = 100_000;
      subject.needs[resource] = 0.1;
    }

    expect(secretNegotiationDiscoveryChance(world, observer, subject, negotiation)).toBe(before);
  });

  test("active recon stores secret-talk snapshots that can become stale and later be reconfirmed", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const partner = world.countries[2]!;
    observer.government.ministries.foreign.competence = 100;
    observer.policy.diplomacy = 100;
    const { negotiation } = addSecretNegotiationFixture(world, subject.id, partner.id);

    let discovered = false;
    for (let week = 13; week <= 13 * 80 && !discovered; week += 13) {
      world.week = week;
      discovered = collectSecretNegotiationIntelligence(world, observer, subject, week).length > 0;
    }
    expect(discovered).toBe(true);

    const initial = getSecretNegotiationIntelligence(world, observer.id)
      .find((intel) => intel.negotiationId === negotiation.id)!;
    expect(initial).toBeDefined();
    expect(initial.status).toBe("open");
    expect(initial.sourceSubjectId).toBe(subject.id);
    expect(initial.discoveredWeek).toBe(initial.lastConfirmedWeek);

    negotiation.status = "rejected";
    negotiation.terminalReason = "cabinet_rejected";
    world.week = initial.lastConfirmedWeek + 39;

    const stale = getSecretNegotiationIntelligence(world, observer.id)
      .find((intel) => intel.negotiationId === negotiation.id)!;
    expect(stale.status).toBe("open");
    expect(stale.lastConfirmedWeek).toBe(initial.lastConfirmedWeek);
    expect(effectiveSecretNegotiationConfidence(stale, world.week)).toBeLessThan(stale.confidence);

    let reconfirmed = false;
    const reconfirmDeadline = world.week + 13 * 80;
    for (let week = world.week + 13; week <= reconfirmDeadline && !reconfirmed; week += 13) {
      world.week = week;
      collectSecretNegotiationIntelligence(world, observer, subject, week);
      const refreshed = getSecretNegotiationIntelligence(world, observer.id)
        .find((intel) => intel.negotiationId === negotiation.id)!;
      reconfirmed = refreshed.lastConfirmedWeek === week && refreshed.status === "rejected";
    }
    expect(reconfirmed).toBe(true);
  });

  test("quarterly recon emits secret-talk discoveries only to the discovering observer", () => {
    let discovery: Exclude<ReturnType<typeof updateIntelligence>[number], string> | undefined;
    let observerId = "";

    for (let seed = 1; seed <= 64 && !discovery; seed++) {
      const world = createInitialWorld(seed);
      world.week = 13;
      const observer = world.countries[0]!;
      observer.government.ministries.foreign.competence = 100;
      observer.policy.diplomacy = 100;
      const target = selectReconTargetFromBelief(world, observer);
      if (!target) continue;
      const subject = world.countries.find((country) => country.id === target.subjectId)!;
      const partner = world.countries.find((country) => country.id !== observer.id && country.id !== subject.id)!;
      addSecretNegotiationFixture(world, subject.id, partner.id);

      const messages = updateIntelligence(world);
      const found = messages.find((message) =>
        typeof message !== "string"
        && message.text.startsWith(`${observer.name} intelligence detects confidential security talks`)
      );
      if (found && typeof found !== "string") {
        discovery = found;
        observerId = observer.id;
      }
    }

    expect(discovery).toBeDefined();
    expect(discovery!.audienceCountryIds).toEqual([observerId]);
    expect(discovery!.publicText).toBeNull();
  });

  test("legacy intelligence repairs secret-negotiation knowledge without inventing discoveries", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const before = structuredClone(getCountryIntelligence(world, observer.id, subject.id));
    delete (world.intelligence as Partial<typeof world.intelligence>).secretNegotiationsByObserver;

    ensureIntelligence(world);

    expect(world.intelligence.secretNegotiationsByObserver).toBeDefined();
    expect(world.intelligence.secretNegotiationsByObserver[observer.id]).toEqual({});
    expect(getCountryIntelligence(world, observer.id, subject.id)).toEqual(before);
  });

  test("military deception posture does not inspect foreign hidden state", () => {
    const world = createInitialWorld(1978);
    const subject = world.countries[0]!;
    const before = militaryDeceptionPostureFor(world, subject);

    for (const foreign of world.countries.filter((country) => country.id !== subject.id)) {
      foreign.population = 10_000;
      foreign.treasury = -100_000;
      foreign.military = 50_000;
      foreign.readiness = 100;
      foreign.stability = 0;
      for (const resource of ["food", "energy", "metals", "goods"] as const) {
        foreign.resources[resource] = 100_000;
        foreign.needs[resource] = 0.1;
      }
    }

    expect(militaryDeceptionPostureFor(world, subject)).toEqual(before);
  });

  test("concealment and exaggeration move the same deterministic observation in opposite directions", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    subject.military = 100;
    subject.readiness = 70;
    const observedWeek = 26;

    world.intelligence.deceptionByCountry[subject.id] = { mode: "none", strengthPct: 0, updatedWeek: observedWeek };
    const baseline = collectCountryIntelligence(world, observer, subject, observedWeek, "routine");

    world.intelligence.deceptionByCountry[subject.id] = { mode: "conceal", strengthPct: 18, updatedWeek: observedWeek };
    const concealed = collectCountryIntelligence(world, observer, subject, observedWeek, "routine");

    world.intelligence.deceptionByCountry[subject.id] = { mode: "exaggerate", strengthPct: 18, updatedWeek: observedWeek };
    const exaggerated = collectCountryIntelligence(world, observer, subject, observedWeek, "routine");

    expect(concealed.estimates.military.value).toBeLessThan(baseline.estimates.military.value);
    expect(exaggerated.estimates.military.value).toBeGreaterThan(baseline.estimates.military.value);
    expect(concealed.estimates.readiness.value).toBeLessThan(baseline.estimates.readiness.value);
    expect(exaggerated.estimates.readiness.value).toBeGreaterThan(baseline.estimates.readiness.value);
    expect(concealed.estimates.military.confidence).toBe(baseline.estimates.military.confidence);
    expect(exaggerated.estimates.military.confidence).toBe(baseline.estimates.military.confidence);
    expect(concealed.estimates.readiness.confidence).toBe(baseline.estimates.readiness.confidence);
    expect(exaggerated.estimates.readiness.confidence).toBe(baseline.estimates.readiness.confidence);

    for (const metric of ["population", "treasury", "stability", "foodExportable", "energyExportable", "metalsExportable", "goodsExportable"] as const) {
      expect(concealed.estimates[metric]).toEqual(baseline.estimates[metric]);
      expect(exaggerated.estimates[metric]).toEqual(baseline.estimates[metric]);
    }
  });

  test("active reconnaissance attenuates military deception without revealing perfect truth", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    world.intelligence.deceptionByCountry[subject.id] = { mode: "conceal", strengthPct: 18, updatedWeek: world.week };

    const routineMilitaryBias = militaryDeceptionObservationBias(world, observer, subject, "military", "routine");
    const reconMilitaryBias = militaryDeceptionObservationBias(world, observer, subject, "military", "recon");
    const routineReadinessBias = militaryDeceptionObservationBias(world, observer, subject, "readiness", "routine");
    const reconReadinessBias = militaryDeceptionObservationBias(world, observer, subject, "readiness", "recon");

    expect(Math.abs(reconMilitaryBias)).toBeLessThan(Math.abs(routineMilitaryBias));
    expect(Math.abs(reconReadinessBias)).toBeLessThan(Math.abs(routineReadinessBias));
    expect(reconMilitaryBias).not.toBe(0);
    expect(reconReadinessBias).not.toBe(0);
  });

  test("deception collection cannot mutate authoritative military truth", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const before = {
      military: subject.military,
      readiness: subject.readiness,
      capacity: subject.militaryCapacity,
    };

    world.intelligence.deceptionByCountry[subject.id] = { mode: "exaggerate", strengthPct: 18, updatedWeek: world.week };
    collectCountryIntelligence(world, observer, subject, world.week, "recon", 16);

    expect({
      military: subject.military,
      readiness: subject.readiness,
      capacity: subject.militaryCapacity,
    }).toEqual(before);
  });

  test("legacy intelligence repairs deception posture without rewriting stored beliefs", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const before = structuredClone(getCountryIntelligence(world, observer.id, subject.id));
    delete (world.intelligence as Partial<typeof world.intelligence>).deceptionByCountry;

    ensureIntelligence(world);

    expect(Object.keys(world.intelligence.deceptionByCountry)).toHaveLength(world.countries.length);
    expect(getCountryIntelligence(world, observer.id, subject.id)).toEqual(before);
  });

  test("belief state cannot directly overwrite authoritative truth", () => {
    const world = createInitialWorld(77);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const profile = getCountryIntelligence(world, observer.id, subject.id)!;
    const before = truthOnly(world);

    for (const estimate of Object.values(profile.estimates)) {
      estimate.value = 999_999;
      estimate.low = 999_000;
      estimate.high = 1_000_000;
      estimate.confidence = 1;
      estimate.observedWeek = -50_000;
    }

    // Phase 5.1+ deliberately lets belief affect later decisions. The invariant
    // is narrower: changing belief cannot itself mutate authoritative reality.
    expect(truthOnly(world)).toEqual(before);
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

  test("weekly policy repairs legacy economic intelligence before the first decision tick", () => {
    const world = createInitialWorld(1978);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const profile = getCountryIntelligence(world, observer.id, subject.id)!;
    const militaryBefore = structuredClone(profile.estimates.military);
    const legacyEstimates = profile.estimates as Partial<typeof profile.estimates>;

    delete legacyEstimates.foodExportable;
    delete legacyEstimates.energyExportable;
    delete legacyEstimates.metalsExportable;
    delete legacyEstimates.goodsExportable;

    tickWeek(world);
    const repaired = getCountryIntelligence(world, observer.id, subject.id)!;

    expect(repaired.estimates.foodExportable).toBeDefined();
    expect(repaired.estimates.energyExportable).toBeDefined();
    expect(repaired.estimates.metalsExportable).toBeDefined();
    expect(repaired.estimates.goodsExportable).toBeDefined();
    expect(repaired.estimates.military).toEqual(militaryBefore);
  });

  test("Phase 5.1 profiles repair missing economic signals without rewriting earlier beliefs", () => {
    const world = createInitialWorld(1978);
    for (let week = 0; week < 21; week++) tickWeek(world);
    const observer = world.countries[0]!;
    const subject = world.countries[1]!;
    const profile = getCountryIntelligence(world, observer.id, subject.id)!;
    const militaryBefore = structuredClone(profile.estimates.military);
    const truthBefore = truthOnly(world);
    const legacyEstimates = profile.estimates as Partial<typeof profile.estimates>;

    delete legacyEstimates.foodExportable;
    delete legacyEstimates.energyExportable;
    delete legacyEstimates.metalsExportable;
    delete legacyEstimates.goodsExportable;

    ensureIntelligence(world);
    const repaired = getCountryIntelligence(world, observer.id, subject.id)!;

    expect(repaired.estimates.foodExportable).toBeDefined();
    expect(repaired.estimates.energyExportable).toBeDefined();
    expect(repaired.estimates.metalsExportable).toBeDefined();
    expect(repaired.estimates.goodsExportable).toBeDefined();
    expect(repaired.estimates.military).toEqual(militaryBefore);
    expect(truthOnly(world)).toEqual(truthBefore);
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
