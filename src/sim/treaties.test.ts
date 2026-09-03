import { describe, expect, test } from "vitest";
import { chooseTradePartner } from "../ai/policy";
import { createInitialWorld, tickWeek } from "./world";
import {
  getTreatyTradePolicy,
  isNonAggressionActive,
  processTreaties,
  recordTreatyTrade,
  registerTreaty,
  requestTreatyWithdrawal,
  resetTreatyWeeklyUsage,
} from "./treaties";

const pairWithRoute = (world: ReturnType<typeof createInitialWorld>) => {
  const route = world.geography.routes[0]!;
  return [world.countries.find((country) => country.id === route.a)!, world.countries.find((country) => country.id === route.b)!] as const;
};

const treasuryTotal = (world: ReturnType<typeof createInitialWorld>) => world.countries.reduce((sum, country) => sum + country.treasury, 0);
const escrowTotal = (world: ReturnType<typeof createInitialWorld>) => world.treaties.reduce((sum, treaty) => sum + Object.values(treaty.treasuryEscrow).reduce((s, value) => s + value, 0), 0);

describe("SimCountry phase 4.0 treaty engine", () => {
  test("initial worlds carry deterministic empty treaty state", () => {
    const a = createInitialWorld(1978);
    const b = createInitialWorld(1978);
    expect(a.nextTreatyId).toBe(1);
    expect(a.treaties).toEqual([]);
    expect(a.treatyViolations).toEqual([]);
    expect(a).toEqual(b);
  });

  test("invalid treaty registration is atomic and leaves authoritative state untouched", () => {
    const world = createInitialWorld(1978);
    const [a, b] = pairWithRoute(world);
    const beforeTreasury = treasuryTotal(world);
    const beforeNextId = world.nextTreatyId;
    const result = registerTreaty(world, {
      title: "Contradictory trade package",
      parties: [a.id, b.id],
      clauses: [
        { kind: "loan", creditorId: a.id, debtorId: b.id, principal: 20, installment: 5, intervalWeeks: 13 },
        { kind: "sanction", imposerId: a.id, targetId: b.id },
        { kind: "preferential_trade", grantorId: a.id, beneficiaryId: b.id, discountPct: 10 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(world.treaties).toHaveLength(0);
    expect(world.nextTreatyId).toBe(beforeNextId);
    expect(treasuryTotal(world)).toBeCloseTo(beforeTreasury, 8);
  });

  test("future loan treaties escrow principal atomically and release it only on the effective week", () => {
    const world = createInitialWorld(1978);
    const [creditor, debtor] = pairWithRoute(world);
    const initialTotal = treasuryTotal(world);
    const creditorBefore = creditor.treasury;
    const debtorBefore = debtor.treasury;
    const result = registerTreaty(world, {
      title: "Development credit facility",
      parties: [creditor.id, debtor.id],
      effectiveWeek: 4,
      clauses: [{ kind: "loan", creditorId: creditor.id, debtorId: debtor.id, principal: 20, installment: 5, intervalWeeks: 13 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.treaty.status).toBe("pending");
    expect(creditor.treasury).toBeCloseTo(creditorBefore - 20, 8);
    expect(debtor.treasury).toBeCloseTo(debtorBefore, 8);
    expect(escrowTotal(world)).toBeCloseTo(20, 8);
    expect(treasuryTotal(world) + escrowTotal(world)).toBeCloseTo(initialTotal, 8);

    world.week = 3;
    processTreaties(world);
    expect(result.treaty.status).toBe("pending");
    world.week = 4;
    processTreaties(world);
    expect(result.treaty.status).toBe("active");
    expect(result.treaty.obligations).toHaveLength(1);
    expect(debtor.treasury).toBeCloseTo(debtorBefore + 20, 8);
    expect(escrowTotal(world)).toBeCloseTo(0, 8);
    expect(treasuryTotal(world)).toBeCloseTo(initialTotal, 8);
  });

  test("scheduled obligations conserve treasury and can be fulfilled", () => {
    const world = createInitialWorld(1978);
    const [creditor, debtor] = pairWithRoute(world);
    const result = registerTreaty(world, {
      title: "Short credit facility",
      parties: [creditor.id, debtor.id],
      clauses: [{ kind: "loan", creditorId: creditor.id, debtorId: debtor.id, principal: 12, installment: 4, intervalWeeks: 2, firstPaymentDelayWeeks: 1 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const afterActivation = treasuryTotal(world);

    for (const week of [1, 3, 5]) {
      world.week = week;
      processTreaties(world);
      expect(treasuryTotal(world)).toBeCloseTo(afterActivation, 8);
    }

    expect(result.treaty.obligations[0]!.remainingAmount).toBe(0);
    expect(result.treaty.obligations[0]!.status).toBe("fulfilled");
    expect(result.treaty.status).toBe("fulfilled");
  });

  test("sanctions, tariffs, preferences and quotas alter authoritative trade policy", () => {
    const world = createInitialWorld(1978);
    const [seller, buyer] = pairWithRoute(world);
    const tariff = registerTreaty(world, {
      title: "Managed trade accord",
      parties: [seller.id, buyer.id],
      clauses: [
        { kind: "tariff", importerId: buyer.id, exporterId: seller.id, ratePct: 12, resource: "goods" },
        { kind: "quota", exporterId: seller.id, importerId: buyer.id, resource: "goods", maxUnitsPerWeek: 9 },
      ],
    });
    expect(tariff.ok).toBe(true);
    let policy = getTreatyTradePolicy(world, buyer.id, seller.id, "goods");
    expect(policy.blocked).toBe(false);
    expect(policy.tariffPct).toBe(12);
    expect(policy.quotaRemaining).toBe(9);
    recordTreatyTrade(world, buyer.id, seller.id, "goods", 4.5);
    policy = getTreatyTradePolicy(world, buyer.id, seller.id, "goods");
    expect(policy.quotaRemaining).toBeCloseTo(4.5, 8);
    resetTreatyWeeklyUsage(world);
    expect(getTreatyTradePolicy(world, buyer.id, seller.id, "goods").quotaRemaining).toBe(9);

    const otherWorld = createInitialWorld(1978);
    const [a, b] = pairWithRoute(otherWorld);
    expect(registerTreaty(otherWorld, {
      title: "Preferential access",
      parties: [a.id, b.id],
      clauses: [{ kind: "preferential_trade", grantorId: b.id, beneficiaryId: a.id, discountPct: 15, resource: "goods" }],
    }).ok).toBe(true);
    expect(getTreatyTradePolicy(otherWorld, b.id, a.id, "goods").discountPct).toBe(15);

    const sanctionWorld = createInitialWorld(1978);
    const [x, y] = pairWithRoute(sanctionWorld);
    expect(registerTreaty(sanctionWorld, {
      title: "Bilateral trade restriction",
      parties: [x.id, y.id],
      clauses: [{ kind: "sanction", imposerId: x.id, targetId: y.id }],
    }).ok).toBe(true);
    expect(getTreatyTradePolicy(sanctionWorld, x.id, y.id, "food").blocked).toBe(true);
    expect(getTreatyTradePolicy(sanctionWorld, y.id, x.id, "goods").blocked).toBe(true);
  });

  test("partner selection refuses sellers blocked by treaty sanctions", () => {
    const world = createInitialWorld(1978);
    const [seller, buyer] = pairWithRoute(world);
    for (const country of world.countries) country.resources.goods = 0;
    buyer.resources.goods = 0;
    seller.resources.goods = seller.needs.goods * 40;
    const before = chooseTradePartner(world, buyer, "goods");
    if (!before || before.seller.id !== seller.id) return;
    expect(registerTreaty(world, {
      title: "Goods embargo",
      parties: [seller.id, buyer.id],
      clauses: [{ kind: "sanction", imposerId: buyer.id, targetId: seller.id, resource: "goods" }],
    }).ok).toBe(true);
    const after = chooseTradePartner(world, buyer, "goods");
    expect(after?.seller.id).not.toBe(seller.id);
  });

  test("non-aggression clauses remain authoritative during autonomous simulation", () => {
    const world = createInitialWorld(1978);
    const adjacent = world.geography.routes.find((route) => route.mode === "land") ?? world.geography.routes[0]!;
    const a = world.countries.find((country) => country.id === adjacent.a)!;
    const b = world.countries.find((country) => country.id === adjacent.b)!;
    const result = registerTreaty(world, {
      title: "Long peace compact",
      parties: [a.id, b.id],
      clauses: [{ kind: "non_aggression" }],
    });
    expect(result.ok).toBe(true);
    expect(isNonAggressionActive(world, a.id, b.id)).toBe(true);

    a.relations[b.id]!.tension = 100;
    a.relations[b.id]!.trust = 0;
    a.readiness = 95;
    a.stability = 95;
    a.government.legitimacy = 95;
    a.government.agenda.defensePosture = 100;
    b.military = Math.max(3, b.militaryCapacity * 0.3);
    for (let week = 0; week < 52 * 10; week++) tickWeek(world);
    expect(world.wars.some((war) => (war.a === a.id && war.b === b.id) || (war.a === b.id && war.b === a.id))).toBe(false);
  });

  test("lawful withdrawal observes notice and then removes treaty effects", () => {
    const world = createInitialWorld(1978);
    const [seller, buyer] = pairWithRoute(world);
    const result = registerTreaty(world, {
      title: "Temporary tariff arrangement",
      parties: [seller.id, buyer.id],
      withdrawalNoticeWeeks: 4,
      clauses: [{ kind: "tariff", importerId: buyer.id, exporterId: seller.id, ratePct: 20 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requestTreatyWithdrawal(world, result.treaty.id, buyer.id).ok).toBe(true);
    world.week = 3;
    processTreaties(world);
    expect(getTreatyTradePolicy(world, buyer.id, seller.id, "food").tariffPct).toBe(20);
    world.week = 4;
    processTreaties(world);
    expect(result.treaty.status).toBe("withdrawn");
    expect(getTreatyTradePolicy(world, buyer.id, seller.id, "food").tariffPct).toBe(0);
  });

  test("expiry removes restrictions exactly at the agreed boundary", () => {
    const world = createInitialWorld(1978);
    const [a, b] = pairWithRoute(world);
    const result = registerTreaty(world, {
      title: "Two-week embargo",
      parties: [a.id, b.id],
      expiryWeek: 2,
      clauses: [{ kind: "sanction", imposerId: a.id, targetId: b.id }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    world.week = 1;
    processTreaties(world);
    expect(getTreatyTradePolicy(world, a.id, b.id, "food").blocked).toBe(true);
    world.week = 2;
    processTreaties(world);
    expect(result.treaty.status).toBe("expired");
    expect(getTreatyTradePolicy(world, a.id, b.id, "food").blocked).toBe(false);
  });

  test("three missed scheduled payments produce a reason-coded material breach", () => {
    const world = createInitialWorld(1978);
    const [payer, payee] = pairWithRoute(world);
    const result = registerTreaty(world, {
      title: "Reparations schedule",
      parties: [payer.id, payee.id],
      clauses: [{ kind: "reparations", payerId: payer.id, payeeId: payee.id, totalAmount: 12, installment: 4, intervalWeeks: 1, firstPaymentDelayWeeks: 1 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    payer.treasury = -payer.population * 5;
    for (const week of [1, 2, 3]) {
      world.week = week;
      processTreaties(world);
    }
    const obligation = result.treaty.obligations[0]!;
    expect(obligation.status).toBe("defaulted");
    expect(obligation.failureReason).toBe("insufficient_treasury");
    expect(result.treaty.status).toBe("violated");
    expect(result.treaty.terminalReason).toBe("material_breach");
    expect(world.treatyViolations.some((violation) => violation.treatyId === result.treaty.id && violation.reason === "insufficient_treasury")).toBe(true);
  });

  test("financial schedules cannot be designed to outlive treaty expiry", () => {
    const world = createInitialWorld(1978);
    const [a, b] = pairWithRoute(world);
    const result = registerTreaty(world, {
      title: "Impossible short loan treaty",
      parties: [a.id, b.id],
      expiryWeek: 10,
      clauses: [{ kind: "loan", creditorId: a.id, debtorId: b.id, principal: 20, installment: 2, intervalWeeks: 4, firstPaymentDelayWeeks: 4 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.includes("finish before treaty expiry"))).toBe(true);
  });
});
