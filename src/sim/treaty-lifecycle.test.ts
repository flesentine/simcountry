import { describe, expect, test } from "vitest";
import { createInitialWorld } from "./world";
import { processTreaties, registerTreaty, requestTreatyWithdrawal } from "./treaties";

const pairWithRoute = (world: ReturnType<typeof createInitialWorld>) => {
  const route = world.geography.routes[0]!;
  return [world.countries.find((country) => country.id === route.a)!, world.countries.find((country) => country.id === route.b)!] as const;
};

const escrowTotal = (world: ReturnType<typeof createInitialWorld>) => world.treaties.reduce((sum, treaty) => sum + Object.values(treaty.treasuryEscrow).reduce((inner, amount) => inner + amount, 0), 0);

describe("SimCountry phase 4.0 treaty lifecycle semantics", () => {
  test("lawful withdrawal ends treaty policy but does not erase already-created debt", () => {
    const world = createInitialWorld(1978);
    const [creditor, debtor] = pairWithRoute(world);
    const result = registerTreaty(world, {
      title: "Withdrawable credit agreement",
      parties: [creditor.id, debtor.id],
      withdrawalNoticeWeeks: 0,
      clauses: [{ kind: "loan", creditorId: creditor.id, debtorId: debtor.id, principal: 6, installment: 2, intervalWeeks: 1, firstPaymentDelayWeeks: 1 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.treaty.obligations[0]!.remainingAmount).toBe(6);

    expect(requestTreatyWithdrawal(world, result.treaty.id, creditor.id).ok).toBe(true);
    expect(result.treaty.status).toBe("withdrawn");
    expect(result.treaty.terminalReason).toBe("lawful_withdrawal");

    for (const week of [1, 2, 3]) {
      world.week = week;
      processTreaties(world);
    }

    expect(result.treaty.status).toBe("withdrawn");
    expect(result.treaty.obligations[0]!.status).toBe("fulfilled");
    expect(result.treaty.obligations[0]!.remainingAmount).toBe(0);
  });

  test("failed future activation refunds loan escrow and records the non-aggression breach", () => {
    const world = createInitialWorld(1978);
    const [creditor, debtor] = pairWithRoute(world);
    const creditorBefore = creditor.treasury;
    const result = registerTreaty(world, {
      title: "Future peace and credit agreement",
      parties: [creditor.id, debtor.id],
      effectiveWeek: 4,
      clauses: [
        { kind: "loan", creditorId: creditor.id, debtorId: debtor.id, principal: 8, installment: 2, intervalWeeks: 2, firstPaymentDelayWeeks: 2 },
        { kind: "non_aggression" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(creditor.treasury).toBeCloseTo(creditorBefore - 8, 8);
    expect(escrowTotal(world)).toBeCloseTo(8, 8);

    world.wars.push({
      id: "future-activation-breach",
      a: creditor.id,
      b: debtor.id,
      attacker: debtor.id,
      startWeek: 2,
      casualtiesA: 0,
      casualtiesB: 0,
      frontCellId: world.geography.cells.find((cell) => cell.ownerId === creditor.id)?.id ?? null,
      supplyA: 70,
      supplyB: 70,
      momentum: 0,
      capturedA: 0,
      capturedB: 0,
      lastCaptureWeek: 2,
      blockadeRouteIds: [],
    });
    world.week = 4;
    processTreaties(world);

    expect(result.treaty.status).toBe("violated");
    expect(result.treaty.obligations).toHaveLength(0);
    expect(creditor.treasury).toBeCloseTo(creditorBefore, 8);
    expect(escrowTotal(world)).toBeCloseTo(0, 8);
    expect(world.treatyViolations).toContainEqual(expect.objectContaining({
      treatyId: result.treaty.id,
      violatorId: debtor.id,
      injuredPartyId: creditor.id,
      reason: "non_aggression_breach",
    }));
  });
});
