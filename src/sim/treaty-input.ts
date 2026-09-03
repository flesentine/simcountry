import { RESOURCE_KEYS, type Resource, type TreatyClauseDraft, type TreatyDraft, type WorldState } from "../model/types";
import { validateTreatyDraft } from "./treaties";

export type TreatyDraftInputResult =
  | { ok: true; draft: TreatyDraft }
  | { ok: false; errors: string[] };

const RESOURCE_SET = new Set<string>(RESOURCE_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function integer(value: unknown): value is number {
  return finiteNumber(value) && Number.isSafeInteger(value);
}

function resource(value: unknown, optional = false): Resource | null | undefined | "invalid" {
  if (value === undefined && optional) return undefined;
  if (value === null) return null;
  return typeof value === "string" && RESOURCE_SET.has(value) ? value as Resource : "invalid";
}

function parseClause(value: unknown, index: number, errors: string[]): TreatyClauseDraft | null {
  if (!isRecord(value)) {
    errors.push(`clause ${index + 1} must be an object`);
    return null;
  }
  if (typeof value.kind !== "string") {
    errors.push(`clause ${index + 1} kind is required`);
    return null;
  }

  const prefix = `clause ${index + 1}`;
  const stringField = (key: string) => typeof value[key] === "string" && (value[key] as string).length > 0 && (value[key] as string).length <= 80;
  const numberField = (key: string) => finiteNumber(value[key]);
  const integerField = (key: string) => integer(value[key]);
  const optionalResource = () => resource(value.resource, true);

  if (value.kind === "non_aggression") {
    if (!hasOnlyKeys(value, ["kind"])) errors.push(`${prefix} contains unsupported fields`);
    return { kind: "non_aggression" };
  }

  if (value.kind === "preferential_trade") {
    if (!hasOnlyKeys(value, ["kind", "grantorId", "beneficiaryId", "discountPct", "resource"])) errors.push(`${prefix} contains unsupported fields`);
    const parsedResource = optionalResource();
    if (!stringField("grantorId") || !stringField("beneficiaryId") || !numberField("discountPct") || parsedResource === "invalid") {
      errors.push(`${prefix} has invalid preferential trade fields`);
      return null;
    }
    return {
      kind: "preferential_trade",
      grantorId: value.grantorId as string,
      beneficiaryId: value.beneficiaryId as string,
      discountPct: value.discountPct as number,
      ...(parsedResource === undefined ? {} : { resource: parsedResource }),
    };
  }

  if (value.kind === "tariff") {
    if (!hasOnlyKeys(value, ["kind", "importerId", "exporterId", "ratePct", "resource"])) errors.push(`${prefix} contains unsupported fields`);
    const parsedResource = optionalResource();
    if (!stringField("importerId") || !stringField("exporterId") || !numberField("ratePct") || parsedResource === "invalid") {
      errors.push(`${prefix} has invalid tariff fields`);
      return null;
    }
    return {
      kind: "tariff",
      importerId: value.importerId as string,
      exporterId: value.exporterId as string,
      ratePct: value.ratePct as number,
      ...(parsedResource === undefined ? {} : { resource: parsedResource }),
    };
  }

  if (value.kind === "quota") {
    if (!hasOnlyKeys(value, ["kind", "exporterId", "importerId", "resource", "maxUnitsPerWeek"])) errors.push(`${prefix} contains unsupported fields`);
    const parsedResource = resource(value.resource);
    if (!stringField("exporterId") || !stringField("importerId") || parsedResource === "invalid" || parsedResource === null || parsedResource === undefined || !numberField("maxUnitsPerWeek")) {
      errors.push(`${prefix} has invalid quota fields`);
      return null;
    }
    return {
      kind: "quota",
      exporterId: value.exporterId as string,
      importerId: value.importerId as string,
      resource: parsedResource,
      maxUnitsPerWeek: value.maxUnitsPerWeek as number,
    };
  }

  if (value.kind === "sanction") {
    if (!hasOnlyKeys(value, ["kind", "imposerId", "targetId", "resource"])) errors.push(`${prefix} contains unsupported fields`);
    const parsedResource = optionalResource();
    if (!stringField("imposerId") || !stringField("targetId") || parsedResource === "invalid") {
      errors.push(`${prefix} has invalid sanction fields`);
      return null;
    }
    return {
      kind: "sanction",
      imposerId: value.imposerId as string,
      targetId: value.targetId as string,
      ...(parsedResource === undefined ? {} : { resource: parsedResource }),
    };
  }

  if (value.kind === "loan") {
    if (!hasOnlyKeys(value, ["kind", "creditorId", "debtorId", "principal", "installment", "intervalWeeks", "firstPaymentDelayWeeks"])) errors.push(`${prefix} contains unsupported fields`);
    const delay = value.firstPaymentDelayWeeks;
    if (!stringField("creditorId") || !stringField("debtorId") || !numberField("principal") || !numberField("installment") || !integerField("intervalWeeks") || (delay !== undefined && !integer(delay))) {
      errors.push(`${prefix} has invalid loan fields`);
      return null;
    }
    return {
      kind: "loan",
      creditorId: value.creditorId as string,
      debtorId: value.debtorId as string,
      principal: value.principal as number,
      installment: value.installment as number,
      intervalWeeks: value.intervalWeeks as number,
      ...(delay === undefined ? {} : { firstPaymentDelayWeeks: delay as number }),
    };
  }

  if (value.kind === "reparations") {
    if (!hasOnlyKeys(value, ["kind", "payerId", "payeeId", "totalAmount", "installment", "intervalWeeks", "firstPaymentDelayWeeks"])) errors.push(`${prefix} contains unsupported fields`);
    const delay = value.firstPaymentDelayWeeks;
    if (!stringField("payerId") || !stringField("payeeId") || !numberField("totalAmount") || !numberField("installment") || !integerField("intervalWeeks") || (delay !== undefined && !integer(delay))) {
      errors.push(`${prefix} has invalid reparations fields`);
      return null;
    }
    return {
      kind: "reparations",
      payerId: value.payerId as string,
      payeeId: value.payeeId as string,
      totalAmount: value.totalAmount as number,
      installment: value.installment as number,
      intervalWeeks: value.intervalWeeks as number,
      ...(delay === undefined ? {} : { firstPaymentDelayWeeks: delay as number }),
    };
  }

  errors.push(`${prefix} has unsupported kind ${value.kind}`);
  return null;
}

export function parseTreatyDraftInput(input: unknown): TreatyDraftInputResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["treaty proposal must be an object"] };
  if (!hasOnlyKeys(input, ["title", "parties", "effectiveWeek", "expiryWeek", "withdrawalNoticeWeeks", "clauses"])) errors.push("treaty proposal contains unsupported fields");

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 120) errors.push("treaty title must contain 1 to 120 characters");

  const parties = input.parties;
  if (!Array.isArray(parties) || parties.length !== 2 || parties.some((id) => typeof id !== "string" || id.length === 0 || id.length > 80)) {
    errors.push("treaty parties must be exactly two non-empty country ids");
  }

  if (input.effectiveWeek !== undefined && !integer(input.effectiveWeek)) errors.push("effectiveWeek must be an integer");
  if (input.expiryWeek !== undefined && input.expiryWeek !== null && !integer(input.expiryWeek)) errors.push("expiryWeek must be an integer or null");
  if (input.withdrawalNoticeWeeks !== undefined && !integer(input.withdrawalNoticeWeeks)) errors.push("withdrawalNoticeWeeks must be an integer");

  const clausesInput = input.clauses;
  if (!Array.isArray(clausesInput) || clausesInput.length < 1 || clausesInput.length > 12) {
    errors.push("treaty proposal must contain between 1 and 12 clauses");
  }

  const clauses: TreatyClauseDraft[] = [];
  if (Array.isArray(clausesInput)) {
    for (let index = 0; index < clausesInput.length && index < 12; index++) {
      const parsed = parseClause(clausesInput[index], index, errors);
      if (parsed) clauses.push(parsed);
    }
  }

  if (errors.length || !Array.isArray(parties) || parties.length !== 2) return { ok: false, errors: [...new Set(errors)] };

  const draft: TreatyDraft = {
    title,
    parties: [String(parties[0]), String(parties[1])],
    clauses,
    ...(input.effectiveWeek === undefined ? {} : { effectiveWeek: input.effectiveWeek as number }),
    ...(input.expiryWeek === undefined ? {} : { expiryWeek: input.expiryWeek as number | null }),
    ...(input.withdrawalNoticeWeeks === undefined ? {} : { withdrawalNoticeWeeks: input.withdrawalNoticeWeeks as number }),
  };
  return { ok: true, draft };
}

export function validateTreatyDraftInput(world: WorldState, input: unknown): TreatyDraftInputResult {
  const parsed = parseTreatyDraftInput(input);
  if (!parsed.ok) return parsed;
  const contextualErrors = validateTreatyDraft(world, parsed.draft);
  return contextualErrors.length ? { ok: false, errors: contextualErrors } : parsed;
}
