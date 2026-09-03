import { describe, expect, test } from "vitest";
import { createInitialWorld } from "./world";
import { processTreaties, registerTreaty, requestTreatyWithdrawal } from "./treaties";

describe("SimCountry phase 4.0 accrued treaty debt", () => {
  test("a later debt default is recorded without rewriting a lawful withdrawal", () => {
    const world = createInitialWorld(1978);
    const route = world.geography.routes[0]!;
    const creditor = world.countries.find((country) => country.id === route.a)!;
    const debtor = world.countries.find((country) => country.id === route.b)!;
    const result = registerTreaty(world, {
      title: "Withdrawn loan with surviving debt",
      parties: [creditor.id, debtor.id],
      withdrawalNoticeWeeks: 0,
      clauses: [{ kind: "loan", creditorId: creditor.id, debtorId: debtor.id, principal: 6, installment: 2, intervalWeeks: 1, firstPaymentDelayWeeks: 1 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(requestTreatyWithdrawal(world, result.treaty.id, creditor.id).ok).toBe(true);
    expect(result.treaty.status).toBe("withdrawn");
    expect(result.treaty.terminalReason).toBe("lawful_withdrawal");

    debtor.treasury = -debtor.population * 5;
    for (const week of [1, 2, 3]) {
      world.week = week;
      processTreaties(world);
    }

    expect(result.treaty.status).toBe("withdrawn");
    expect(result.treaty.terminalReason).toBe("lawful_withdrawal");
    expect(result.treaty.obligations[0]!.status).toBe("defaulted");
    expect(world.treatyViolations).toContainEqual(expect.objectContaining({
      treatyId: result.treaty.id,
      violatorId: debtor.id,
      injuredPartyId: creditor.id,
      reason: "insufficient_treasury",
    }));
  });
});
