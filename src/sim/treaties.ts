import type {
  Country,
  LoanClause,
  NonAggressionClause,
  ObligationFailureReason,
  PreferentialTradeClause,
  QuotaClause,
  ReparationsClause,
  Resource,
  SanctionClause,
  TariffClause,
  Treaty,
  TreatyClause,
  TreatyObligation,
  TreatyViolation,
  WorldState,
} from "../model/types";

export type TreatyClauseDraft =
  | { kind: "preferential_trade"; grantorId: string; beneficiaryId: string; discountPct: number; resource?: Resource | null }
  | { kind: "tariff"; importerId: string; exporterId: string; ratePct: number; resource?: Resource | null }
  | { kind: "quota"; exporterId: string; importerId: string; resource: Resource; maxUnitsPerWeek: number }
  | { kind: "non_aggression" }
  | { kind: "sanction"; imposerId: string; targetId: string; resource?: Resource | null }
  | { kind: "loan"; creditorId: string; debtorId: string; principal: number; installment: number; intervalWeeks: number; firstPaymentDelayWeeks?: number }
  | { kind: "reparations"; payerId: string; payeeId: string; totalAmount: number; installment: number; intervalWeeks: number; firstPaymentDelayWeeks?: number };

export interface TreatyDraft {
  title: string;
  parties: [string, string];
  effectiveWeek?: number;
  expiryWeek?: number | null;
  withdrawalNoticeWeeks?: number;
  clauses: TreatyClauseDraft[];
}

export type TreatyRegistrationResult =
  | { ok: true; treaty: Treaty }
  | { ok: false; errors: string[] };

export interface TreatyTradePolicy {
  blocked: boolean;
  tariffPct: number;
  discountPct: number;
  quotaRemaining: number;
}

const round = (value: number) => Math.round(value * 100) / 100;
const TERMINAL_STATUSES = new Set<Treaty["status"]>(["fulfilled", "violated", "expired", "withdrawn"]);

function countryById(world: WorldState, id: string) {
  return world.countries.find((country) => country.id === id);
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function resourceKey(resource: Resource | null | undefined) {
  return resource ?? "*";
}

function clauseScope(draft: TreatyClauseDraft, parties: [string, string]) {
  if (draft.kind === "non_aggression") return `non-aggression:${pairKey(parties[0], parties[1])}`;
  if (draft.kind === "preferential_trade") return `preference:${draft.grantorId}>${draft.beneficiaryId}:${resourceKey(draft.resource)}`;
  if (draft.kind === "tariff") return `tariff:${draft.importerId}>${draft.exporterId}:${resourceKey(draft.resource)}`;
  if (draft.kind === "quota") return `quota:${draft.exporterId}>${draft.importerId}:${draft.resource}`;
  if (draft.kind === "sanction") return `sanction:${pairKey(draft.imposerId, draft.targetId)}:${resourceKey(draft.resource)}`;
  if (draft.kind === "loan") return `loan:${draft.creditorId}>${draft.debtorId}`;
  return `reparations:${draft.payerId}>${draft.payeeId}`;
}

function buildClause(draft: TreatyClauseDraft, treatyId: string, index: number, parties: [string, string]): TreatyClause {
  const base = {
    id: `${treatyId}-clause-${index + 1}`,
    status: "pending" as const,
    scope: clauseScope(draft, parties),
  };
  if (draft.kind === "preferential_trade") {
    return { ...base, class: "permission", kind: draft.kind, grantorId: draft.grantorId, beneficiaryId: draft.beneficiaryId, discountPct: draft.discountPct, resource: draft.resource ?? null } satisfies PreferentialTradeClause;
  }
  if (draft.kind === "tariff") {
    return { ...base, class: "restriction", kind: draft.kind, importerId: draft.importerId, exporterId: draft.exporterId, ratePct: draft.ratePct, resource: draft.resource ?? null } satisfies TariffClause;
  }
  if (draft.kind === "quota") {
    return { ...base, class: "restriction", kind: draft.kind, exporterId: draft.exporterId, importerId: draft.importerId, resource: draft.resource, maxUnitsPerWeek: draft.maxUnitsPerWeek, usedThisWeek: 0 } satisfies QuotaClause;
  }
  if (draft.kind === "non_aggression") {
    return { ...base, class: "restriction", kind: draft.kind } satisfies NonAggressionClause;
  }
  if (draft.kind === "sanction") {
    return { ...base, class: "restriction", kind: draft.kind, imposerId: draft.imposerId, targetId: draft.targetId, resource: draft.resource ?? null } satisfies SanctionClause;
  }
  if (draft.kind === "loan") {
    return {
      ...base,
      class: "obligation",
      kind: draft.kind,
      creditorId: draft.creditorId,
      debtorId: draft.debtorId,
      principal: draft.principal,
      installment: draft.installment,
      intervalWeeks: draft.intervalWeeks,
      firstPaymentDelayWeeks: draft.firstPaymentDelayWeeks ?? draft.intervalWeeks,
    } satisfies LoanClause;
  }
  return {
    ...base,
    class: "obligation",
    kind: draft.kind,
    payerId: draft.payerId,
    payeeId: draft.payeeId,
    totalAmount: draft.totalAmount,
    installment: draft.installment,
    intervalWeeks: draft.intervalWeeks,
    firstPaymentDelayWeeks: draft.firstPaymentDelayWeeks ?? draft.intervalWeeks,
  } satisfies ReparationsClause;
}

function clauseCountryIds(clause: TreatyClauseDraft) {
  if (clause.kind === "non_aggression") return [] as string[];
  if (clause.kind === "preferential_trade") return [clause.grantorId, clause.beneficiaryId];
  if (clause.kind === "tariff") return [clause.importerId, clause.exporterId];
  if (clause.kind === "quota") return [clause.exporterId, clause.importerId];
  if (clause.kind === "sanction") return [clause.imposerId, clause.targetId];
  if (clause.kind === "loan") return [clause.creditorId, clause.debtorId];
  return [clause.payerId, clause.payeeId];
}

function resourceOverlaps(a: Resource | null, b: Resource | null) {
  return a === null || b === null || a === b;
}

function tradePairForClause(clause: TreatyClause) {
  if (clause.kind === "preferential_trade") return { a: clause.grantorId, b: clause.beneficiaryId, resource: clause.resource };
  if (clause.kind === "tariff") return { a: clause.importerId, b: clause.exporterId, resource: clause.resource };
  if (clause.kind === "quota") return { a: clause.exporterId, b: clause.importerId, resource: clause.resource };
  if (clause.kind === "sanction") return { a: clause.imposerId, b: clause.targetId, resource: clause.resource };
  return null;
}

function sameDirection(a: TreatyClause, b: TreatyClause) {
  if (a.kind === "tariff" && b.kind === "tariff") return a.importerId === b.importerId && a.exporterId === b.exporterId;
  if (a.kind === "preferential_trade" && b.kind === "preferential_trade") return a.grantorId === b.grantorId && a.beneficiaryId === b.beneficiaryId;
  if (a.kind === "quota" && b.kind === "quota") return a.exporterId === b.exporterId && a.importerId === b.importerId;
  if (a.kind === "tariff" && b.kind === "preferential_trade") return a.importerId === b.grantorId && a.exporterId === b.beneficiaryId;
  if (a.kind === "preferential_trade" && b.kind === "tariff") return a.grantorId === b.importerId && a.beneficiaryId === b.exporterId;
  return false;
}

function clausesConflict(a: TreatyClause, b: TreatyClause) {
  if (a.kind === "non_aggression" && b.kind === "non_aggression") return true;
  const ap = tradePairForClause(a);
  const bp = tradePairForClause(b);
  if (!ap || !bp || pairKey(ap.a, ap.b) !== pairKey(bp.a, bp.b) || !resourceOverlaps(ap.resource, bp.resource)) return false;
  if (a.kind === "sanction" || b.kind === "sanction") return true;
  if ((a.kind === "tariff" || a.kind === "preferential_trade") && (b.kind === "tariff" || b.kind === "preferential_trade")) return sameDirection(a, b);
  if (a.kind === "quota" && b.kind === "quota") return sameDirection(a, b);
  return false;
}

function windowsOverlap(aStart: number, aEnd: number | null, bStart: number, bEnd: number | null) {
  const ae = aEnd ?? Number.POSITIVE_INFINITY;
  const be = bEnd ?? Number.POSITIVE_INFINITY;
  return aStart < be && bStart < ae;
}

function obligationLastDueWeek(effectiveWeek: number, total: number, installment: number, intervalWeeks: number, firstDelay: number) {
  const payments = Math.ceil(total / installment);
  return effectiveWeek + firstDelay + Math.max(0, payments - 1) * intervalWeeks;
}

export function validateTreatyDraft(world: WorldState, draft: TreatyDraft) {
  const errors: string[] = [];
  const [a, b] = draft.parties;
  const partySet = new Set(draft.parties);
  const effectiveWeek = draft.effectiveWeek ?? world.week;
  const expiryWeek = draft.expiryWeek ?? null;
  const withdrawalNoticeWeeks = draft.withdrawalNoticeWeeks ?? 13;

  if (!a || !b || a === b || partySet.size !== 2) errors.push("treaty must contain exactly two distinct parties");
  if (!countryById(world, a) || !countryById(world, b)) errors.push("all treaty parties must exist in the world");
  if (!draft.title.trim()) errors.push("treaty title is required");
  if (!draft.clauses.length) errors.push("treaty must contain at least one clause");
  if (!Number.isInteger(effectiveWeek) || effectiveWeek < world.week) errors.push("effective week cannot be before the current week");
  if (expiryWeek !== null && (!Number.isInteger(expiryWeek) || expiryWeek <= effectiveWeek)) errors.push("expiry week must be after the effective week");
  if (!Number.isInteger(withdrawalNoticeWeeks) || withdrawalNoticeWeeks < 0 || withdrawalNoticeWeeks > 260) errors.push("withdrawal notice must be between 0 and 260 weeks");

  for (const clause of draft.clauses) {
    const ids = clauseCountryIds(clause);
    if (ids.some((id) => !partySet.has(id))) errors.push(`${clause.kind} clause may reference only treaty parties`);
    if (ids.length === 2 && ids[0] === ids[1]) errors.push(`${clause.kind} clause requires two different countries`);
    if (clause.kind === "preferential_trade" && (!Number.isFinite(clause.discountPct) || clause.discountPct < 0 || clause.discountPct > 50)) errors.push("preferential trade discount must be between 0 and 50 percent");
    if (clause.kind === "tariff" && (!Number.isFinite(clause.ratePct) || clause.ratePct < 0 || clause.ratePct > 100)) errors.push("tariff rate must be between 0 and 100 percent");
    if (clause.kind === "quota" && (!Number.isFinite(clause.maxUnitsPerWeek) || clause.maxUnitsPerWeek <= 0)) errors.push("quota must have positive weekly capacity");
    if (clause.kind === "loan") {
      if (![clause.principal, clause.installment].every((value) => Number.isFinite(value) && value > 0)) errors.push("loan principal and installment must be positive");
      if (!Number.isInteger(clause.intervalWeeks) || clause.intervalWeeks <= 0) errors.push("loan interval must be a positive integer");
      const delay = clause.firstPaymentDelayWeeks ?? clause.intervalWeeks;
      if (!Number.isInteger(delay) || delay <= 0) errors.push("loan first payment delay must be a positive integer");
      if (expiryWeek !== null && clause.principal > 0 && clause.installment > 0 && clause.intervalWeeks > 0 && delay > 0 && expiryWeek <= obligationLastDueWeek(effectiveWeek, clause.principal, clause.installment, clause.intervalWeeks, delay)) errors.push("loan repayment schedule must finish before treaty expiry");
    }
    if (clause.kind === "reparations") {
      if (![clause.totalAmount, clause.installment].every((value) => Number.isFinite(value) && value > 0)) errors.push("reparations total and installment must be positive");
      if (!Number.isInteger(clause.intervalWeeks) || clause.intervalWeeks <= 0) errors.push("reparations interval must be a positive integer");
      const delay = clause.firstPaymentDelayWeeks ?? clause.intervalWeeks;
      if (!Number.isInteger(delay) || delay <= 0) errors.push("reparations first payment delay must be a positive integer");
      if (expiryWeek !== null && clause.totalAmount > 0 && clause.installment > 0 && clause.intervalWeeks > 0 && delay > 0 && expiryWeek <= obligationLastDueWeek(effectiveWeek, clause.totalAmount, clause.installment, clause.intervalWeeks, delay)) errors.push("reparations schedule must finish before treaty expiry");
    }
  }

  const previewId = `preview-${world.nextTreatyId}`;
  const compiled = draft.clauses.map((clause, index) => buildClause(clause, previewId, index, draft.parties));
  for (let i = 0; i < compiled.length; i++) {
    for (let j = i + 1; j < compiled.length; j++) {
      if (clausesConflict(compiled[i]!, compiled[j]!)) errors.push(`conflicting treaty clauses: ${compiled[i]!.kind} and ${compiled[j]!.kind}`);
    }
  }

  const nonAggression = compiled.some((clause) => clause.kind === "non_aggression");
  if (nonAggression && effectiveWeek <= world.week && world.wars.some((war) => pairKey(war.a, war.b) === pairKey(a, b))) errors.push("non-aggression treaty cannot activate while its parties are at war");

  for (const treaty of world.treaties) {
    if (TERMINAL_STATUSES.has(treaty.status) || pairKey(treaty.parties[0], treaty.parties[1]) !== pairKey(a, b)) continue;
    if (!windowsOverlap(effectiveWeek, expiryWeek, treaty.effectiveWeek, treaty.expiryWeek)) continue;
    for (const clause of compiled) {
      const conflict = treaty.clauses.find((existing) => clausesConflict(clause, existing));
      if (conflict) errors.push(`clause ${clause.kind} conflicts with ${treaty.id}:${conflict.kind}`);
    }
  }

  const escrowByCountry: Record<string, number> = {};
  for (const clause of draft.clauses) {
    if (clause.kind !== "loan" || !Number.isFinite(clause.principal) || clause.principal <= 0) continue;
    escrowByCountry[clause.creditorId] = (escrowByCountry[clause.creditorId] ?? 0) + clause.principal;
  }
  for (const [countryId, amount] of Object.entries(escrowByCountry)) {
    const creditor = countryById(world, countryId);
    if (creditor && creditor.treasury + 1e-9 < amount) errors.push(`${creditor.name} cannot fund $${round(amount)}B of treaty loan escrow`);
  }

  return [...new Set(errors)];
}

function createObligation(treaty: Treaty, clause: LoanClause | ReparationsClause): TreatyObligation {
  const isLoan = clause.kind === "loan";
  const payerId = isLoan ? clause.debtorId : clause.payerId;
  const payeeId = isLoan ? clause.creditorId : clause.payeeId;
  const total = isLoan ? clause.principal : clause.totalAmount;
  return {
    id: `${treaty.id}-obligation-${treaty.obligations.length + 1}`,
    treatyId: treaty.id,
    clauseId: clause.id,
    payerId,
    payeeId,
    totalAmount: total,
    paidAmount: 0,
    remainingAmount: total,
    installment: clause.installment,
    intervalWeeks: clause.intervalWeeks,
    nextDueWeek: treaty.effectiveWeek + clause.firstPaymentDelayWeeks,
    status: "active",
    missedPayments: 0,
    failureReason: null,
  };
}

function refundEscrow(world: WorldState, treaty: Treaty) {
  for (const [countryId, amount] of Object.entries(treaty.treasuryEscrow)) {
    const country = countryById(world, countryId);
    if (country && amount > 0) country.treasury += amount;
    treaty.treasuryEscrow[countryId] = 0;
  }
}

function activateTreaty(world: WorldState, treaty: Treaty) {
  const parties = treaty.parties.map((id) => countryById(world, id));
  if (parties.some((party) => !party)) {
    refundEscrow(world, treaty);
    treaty.status = "violated";
    treaty.terminalReason = "counterparty_missing";
    return;
  }
  if (treaty.clauses.some((clause) => clause.kind === "non_aggression") && world.wars.some((war) => pairKey(war.a, war.b) === pairKey(treaty.parties[0], treaty.parties[1]))) {
    refundEscrow(world, treaty);
    treaty.status = "violated";
    treaty.terminalReason = "material_breach";
    return;
  }

  treaty.status = "active";
  treaty.activatedWeek = world.week;
  for (const clause of treaty.clauses) clause.status = "active";

  for (const clause of treaty.clauses) {
    if (clause.kind === "loan") {
      const debtor = countryById(world, clause.debtorId)!;
      const escrowed = treaty.treasuryEscrow[clause.creditorId] ?? 0;
      const released = Math.min(clause.principal, escrowed);
      debtor.treasury += released;
      treaty.treasuryEscrow[clause.creditorId] = round(escrowed - released);
      treaty.obligations.push(createObligation(treaty, clause));
    } else if (clause.kind === "reparations") {
      treaty.obligations.push(createObligation(treaty, clause));
    }
  }
}

export function registerTreaty(world: WorldState, draft: TreatyDraft): TreatyRegistrationResult {
  const errors = validateTreatyDraft(world, draft);
  if (errors.length) return { ok: false, errors };

  const id = `treaty-${world.nextTreatyId}`;
  const effectiveWeek = draft.effectiveWeek ?? world.week;
  const treaty: Treaty = {
    id,
    title: draft.title.trim(),
    parties: draft.parties,
    signedWeek: world.week,
    effectiveWeek,
    expiryWeek: draft.expiryWeek ?? null,
    withdrawalNoticeWeeks: draft.withdrawalNoticeWeeks ?? 13,
    status: effectiveWeek > world.week ? "pending" : "active",
    clauses: draft.clauses.map((clause, index) => buildClause(clause, id, index, draft.parties)),
    obligations: [],
    treasuryEscrow: {},
    activatedWeek: null,
    withdrawalRequestedBy: null,
    withdrawalEffectiveWeek: null,
    terminalReason: null,
  };

  for (const clause of treaty.clauses) {
    if (clause.kind !== "loan") continue;
    const creditor = countryById(world, clause.creditorId)!;
    creditor.treasury -= clause.principal;
    treaty.treasuryEscrow[clause.creditorId] = round((treaty.treasuryEscrow[clause.creditorId] ?? 0) + clause.principal);
  }

  world.nextTreatyId += 1;
  world.treaties.push(treaty);
  if (effectiveWeek <= world.week) activateTreaty(world, treaty);
  return { ok: true, treaty };
}

function activeTreatyClauses(world: WorldState) {
  return world.treaties.flatMap((treaty) => treaty.status === "active" ? treaty.clauses.filter((clause) => clause.status === "active") : []);
}

export function getActiveTreaties(world: WorldState, countryId?: string) {
  return world.treaties.filter((treaty) => treaty.status === "active" && (!countryId || treaty.parties.includes(countryId)));
}

export function isNonAggressionActive(world: WorldState, a: string, b: string) {
  return getActiveTreaties(world).some((treaty) => pairKey(treaty.parties[0], treaty.parties[1]) === pairKey(a, b) && treaty.clauses.some((clause) => clause.kind === "non_aggression" && clause.status === "active"));
}

function matchesResource(clauseResource: Resource | null, resource: Resource) {
  return clauseResource === null || clauseResource === resource;
}

export function getTreatyTradePolicy(world: WorldState, buyerId: string, sellerId: string, resource: Resource): TreatyTradePolicy {
  let blocked = false;
  let tariffPct = 0;
  let discountPct = 0;
  let quotaRemaining = Number.POSITIVE_INFINITY;
  for (const clause of activeTreatyClauses(world)) {
    if (clause.kind === "sanction" && pairKey(clause.imposerId, clause.targetId) === pairKey(buyerId, sellerId) && matchesResource(clause.resource, resource)) blocked = true;
    if (clause.kind === "tariff" && clause.importerId === buyerId && clause.exporterId === sellerId && matchesResource(clause.resource, resource)) tariffPct += clause.ratePct;
    if (clause.kind === "preferential_trade" && clause.grantorId === buyerId && clause.beneficiaryId === sellerId && matchesResource(clause.resource, resource)) discountPct += clause.discountPct;
    if (clause.kind === "quota" && clause.importerId === buyerId && clause.exporterId === sellerId && clause.resource === resource) quotaRemaining = Math.min(quotaRemaining, Math.max(0, clause.maxUnitsPerWeek - clause.usedThisWeek));
  }
  return { blocked, tariffPct: Math.min(200, tariffPct), discountPct: Math.min(80, discountPct), quotaRemaining };
}

export function recordTreatyTrade(world: WorldState, buyerId: string, sellerId: string, resource: Resource, amount: number) {
  if (amount <= 0) return;
  for (const clause of activeTreatyClauses(world)) {
    if (clause.kind === "quota" && clause.importerId === buyerId && clause.exporterId === sellerId && clause.resource === resource) {
      clause.usedThisWeek = round(clause.usedThisWeek + amount);
    }
  }
}

export function resetTreatyWeeklyUsage(world: WorldState) {
  for (const treaty of world.treaties) {
    for (const clause of treaty.clauses) if (clause.kind === "quota") clause.usedThisWeek = 0;
  }
}

function recordViolation(world: WorldState, treaty: Treaty, obligation: TreatyObligation, reason: ObligationFailureReason) {
  if (world.treatyViolations.some((violation) => violation.treatyId === treaty.id && violation.clauseId === obligation.clauseId && violation.reason === reason && violation.week === world.week)) return;
  const violation: TreatyViolation = {
    id: `violation-${treaty.id}-${world.week}-${world.treatyViolations.length + 1}`,
    treatyId: treaty.id,
    clauseId: obligation.clauseId,
    violatorId: obligation.payerId,
    injuredPartyId: obligation.payeeId,
    week: world.week,
    reason,
    severity: Math.min(100, 35 + obligation.missedPayments * 18),
  };
  world.treatyViolations.push(violation);
}

function processObligation(world: WorldState, treaty: Treaty, obligation: TreatyObligation) {
  if (obligation.status !== "active" || world.week < obligation.nextDueWeek) return;
  const payer = countryById(world, obligation.payerId);
  const payee = countryById(world, obligation.payeeId);
  if (!payer || !payee) {
    obligation.status = "suspended";
    obligation.failureReason = "counterparty_missing";
    treaty.status = "violated";
    treaty.terminalReason = "counterparty_missing";
    recordViolation(world, treaty, obligation, "counterparty_missing");
    return;
  }

  const due = Math.min(obligation.installment, obligation.remainingAmount);
  const debtHeadroom = Math.max(0, payer.treasury + payer.population * 5);
  const paid = round(Math.min(due, debtHeadroom));
  if (paid > 0) {
    payer.treasury -= paid;
    payee.treasury += paid;
    obligation.paidAmount = round(obligation.paidAmount + paid);
    obligation.remainingAmount = round(Math.max(0, obligation.totalAmount - obligation.paidAmount));
  }

  if (paid + 0.0001 < due) {
    obligation.missedPayments += 1;
    obligation.failureReason = "insufficient_treasury";
    if (obligation.missedPayments >= 3) {
      obligation.status = "defaulted";
      treaty.status = "violated";
      treaty.terminalReason = "material_breach";
      const clause = treaty.clauses.find((candidate) => candidate.id === obligation.clauseId);
      if (clause) clause.status = "violated";
      recordViolation(world, treaty, obligation, "insufficient_treasury");
    }
  } else {
    obligation.failureReason = null;
  }

  if (obligation.remainingAmount <= 0.0001) {
    obligation.remainingAmount = 0;
    obligation.status = "fulfilled";
    const clause = treaty.clauses.find((candidate) => candidate.id === obligation.clauseId);
    if (clause?.class === "obligation") clause.status = "fulfilled";
  } else if (obligation.status === "active") {
    obligation.nextDueWeek += obligation.intervalWeeks;
  }
}

function terminateTreaty(world: WorldState, treaty: Treaty, status: "expired" | "withdrawn") {
  if (treaty.status === "pending") refundEscrow(world, treaty);
  treaty.status = status;
  treaty.terminalReason = status === "expired" ? "expiry" : "lawful_withdrawal";
  for (const clause of treaty.clauses) {
    if (clause.class !== "obligation" || clause.status === "active" || clause.status === "pending") clause.status = status;
  }
}

export function requestTreatyWithdrawal(world: WorldState, treatyId: string, countryId: string) {
  const treaty = world.treaties.find((candidate) => candidate.id === treatyId);
  if (!treaty) return { ok: false as const, error: "treaty not found" };
  if (!treaty.parties.includes(countryId)) return { ok: false as const, error: "only a treaty party may request withdrawal" };
  if (TERMINAL_STATUSES.has(treaty.status)) return { ok: false as const, error: "treaty is already terminal" };
  if (treaty.withdrawalRequestedBy) return { ok: false as const, error: "withdrawal has already been requested" };
  treaty.withdrawalRequestedBy = countryId;
  treaty.withdrawalEffectiveWeek = world.week + treaty.withdrawalNoticeWeeks;
  if (treaty.withdrawalNoticeWeeks === 0) terminateTreaty(world, treaty, "withdrawn");
  return { ok: true as const, treaty };
}

export function processTreaties(world: WorldState) {
  const messages: string[] = [];
  for (const treaty of world.treaties) {
    if (treaty.status === "pending" && world.week >= treaty.effectiveWeek) {
      activateTreaty(world, treaty);
      if (treaty.activatedWeek === world.week) messages.push(`${treaty.title} enters into force between ${treaty.parties.join(" and ")}.`);
    }

    if ((treaty.status === "active" || treaty.status === "pending") && treaty.withdrawalEffectiveWeek !== null && world.week >= treaty.withdrawalEffectiveWeek) {
      terminateTreaty(world, treaty, "withdrawn");
      messages.push(`${treaty.title} ends after its lawful withdrawal notice period.`);
    }

    if ((treaty.status === "active" || treaty.status === "pending") && treaty.expiryWeek !== null && world.week >= treaty.expiryWeek) {
      terminateTreaty(world, treaty, "expired");
      messages.push(`${treaty.title} expires at the end of its agreed term.`);
    }

    if (treaty.activatedWeek !== null) {
      for (const obligation of treaty.obligations) processObligation(world, treaty, obligation);
    }

    const hasOngoingClauses = treaty.clauses.some((clause) => clause.class !== "obligation" && clause.status === "active");
    const obligationClauses = treaty.clauses.filter((clause) => clause.class === "obligation");
    const allObligationsFulfilled = obligationClauses.length > 0 && treaty.obligations.length === obligationClauses.length && treaty.obligations.every((obligation) => obligation.status === "fulfilled");
    if (treaty.status === "active" && allObligationsFulfilled && !hasOngoingClauses && treaty.expiryWeek === null) {
      treaty.status = "fulfilled";
      treaty.terminalReason = "term_completed";
      messages.push(`${treaty.title} is fulfilled after all obligations are completed.`);
    }
  }
  return messages;
}

export function treatySummaryFor(country: Country, world: WorldState) {
  const treaties = world.treaties.filter((treaty) => treaty.parties.includes(country.id));
  return {
    total: treaties.length,
    active: treaties.filter((treaty) => treaty.status === "active").length,
    pending: treaties.filter((treaty) => treaty.status === "pending").length,
    obligations: treaties.flatMap((treaty) => treaty.obligations).filter((obligation) => obligation.status === "active").length,
  };
}
