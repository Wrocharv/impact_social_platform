import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type FallbackCashContribution = {
  id: number;
  campaignId: number;
  donorName: string | null;
  donorCpf: string | null;
  donorWhatsapp: string | null;
  donorEmail: string | null;
  donorCity: string | null;
  donorChurch: string | null;
  allowPublicDisplay: boolean | null;
  amount: number;
  status: "pending" | "approved" | "rejected";
  paymentMethod: "cash";
  paymentStatusDetail:
    | "awaiting_cash_confirmation"
    | "cash_validated_in_person"
    | "cash_validation_rejected";
  validatedBy: number | null;
  validatedAt: Date | null;
  validationNote: string | null;
  validatorName: string | null;
  validatorEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PersistedFallbackCashContribution = Omit<FallbackCashContribution, "createdAt" | "updatedAt" | "validatedAt"> & {
  createdAt: string;
  updatedAt: string;
  validatedAt: string | null;
};

const fallbackCashFile = path.resolve(process.cwd(), "server", ".cash-validations-fallback.json");

function loadFromDisk(): FallbackCashContribution[] {
  try {
    if (!existsSync(fallbackCashFile)) return [];

    const raw = readFileSync(fallbackCashFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => {
      const row = item as PersistedFallbackCashContribution;
      return {
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        validatedAt: row.validatedAt ? new Date(row.validatedAt) : null,
      };
    });
  } catch {
    return [];
  }
}

function persist(rows: FallbackCashContribution[]) {
  mkdirSync(path.dirname(fallbackCashFile), { recursive: true });
  const payload: PersistedFallbackCashContribution[] = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
  }));
  writeFileSync(fallbackCashFile, JSON.stringify(payload, null, 2));
}

function readRows() {
  return loadFromDisk();
}

function writeRows(rows: FallbackCashContribution[]) {
  persist(rows);
}

export function createFallbackCashContribution(input: {
  campaignId: number;
  amount: number;
  donorName?: string;
  donorCpf?: string;
  donorEmail?: string;
  donorWhatsapp?: string;
  donorCity?: string;
  donorChurch?: string;
  allowPublicDisplay?: boolean;
}) {
  const rows = readRows();
  const nextId = rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 700001;
  const now = new Date();

  const contribution: FallbackCashContribution = {
    id: nextId,
    campaignId: input.campaignId,
    donorName: input.donorName?.trim() || null,
    donorCpf: input.donorCpf?.trim().replace(/\D/g, "") || null,
    donorWhatsapp: input.donorWhatsapp?.trim() || null,
    donorEmail: input.donorEmail?.trim().toLowerCase() || null,
    donorCity: input.donorCity?.trim() || null,
    donorChurch: input.donorChurch?.trim() || null,
    allowPublicDisplay: input.allowPublicDisplay ?? null,
    amount: Math.max(0, Math.round(input.amount)),
    status: "pending",
    paymentMethod: "cash",
    paymentStatusDetail: "awaiting_cash_confirmation",
    validatedBy: null,
    validatedAt: null,
    validationNote: null,
    validatorName: null,
    validatorEmail: null,
    createdAt: now,
    updatedAt: now,
  };

  rows.push(contribution);
  writeRows(rows);
  return contribution;
}

export function listFallbackPendingCashValidations(campaignId?: number) {
  return readRows()
    .filter((row) => {
      if (campaignId && row.campaignId !== campaignId) return false;
      return row.status === "pending" && row.paymentStatusDetail === "awaiting_cash_confirmation";
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      donorName: row.donorName,
      donorCpf: row.donorCpf,
      donorWhatsapp: row.donorWhatsapp,
      donorEmail: row.donorEmail,
      donorCity: row.donorCity,
      donorChurch: row.donorChurch,
      allowPublicDisplay: row.allowPublicDisplay,
      amount: row.amount,
      createdAt: row.createdAt,
      paymentStatusDetail: row.paymentStatusDetail,
    }));
}

export function listFallbackRecentCashValidations(input?: { campaignId?: number; limit?: number }) {
  return readRows()
    .filter((row) => {
      if (input?.campaignId && row.campaignId !== input.campaignId) return false;
      return row.paymentStatusDetail === "cash_validated_in_person" || row.paymentStatusDetail === "cash_validation_rejected";
    })
    .sort((left, right) => {
      const rightTs = (right.validatedAt ?? right.updatedAt).getTime();
      const leftTs = (left.validatedAt ?? left.updatedAt).getTime();
      return rightTs - leftTs;
    })
    .slice(0, input?.limit ?? 20)
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      donorName: row.donorName,
      donorCpf: row.donorCpf,
      amount: row.amount,
      status: row.status,
      paymentStatusDetail: row.paymentStatusDetail,
      validatedBy: row.validatedBy,
      validatedAt: row.validatedAt,
      validationNote: row.validationNote,
      validatorName: row.validatorName,
      validatorEmail: row.validatorEmail,
      donorEmail: row.donorEmail,
      donorWhatsapp: row.donorWhatsapp,
      donorCity: row.donorCity,
      donorChurch: row.donorChurch,
      allowPublicDisplay: row.allowPublicDisplay,
    }));
}

export function listFallbackCashContributions(campaignId?: number) {
  return readRows()
    .filter((row) => {
      if (campaignId && row.campaignId !== campaignId) return false;
      return true;
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export function listFallbackApprovedCashContributions(campaignId?: number) {
  return readRows()
    .filter((row) => {
      if (campaignId && row.campaignId !== campaignId) return false;
      return row.status === "approved" && row.paymentStatusDetail === "cash_validated_in_person";
    })
    .sort((left, right) => {
      const rightTs = (right.validatedAt ?? right.updatedAt).getTime();
      const leftTs = (left.validatedAt ?? left.updatedAt).getTime();
      return rightTs - leftTs;
    })
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      amount: row.amount,
      donorName: row.donorName,
      donorWhatsapp: row.donorWhatsapp,
      donorCity: row.donorCity,
      validatedAt: row.validatedAt,
    }));
}

export function reviewFallbackCashContribution(input: {
  contributionId: number;
  decision: "approve" | "reject";
  validatedBy: number;
  validatorName?: string | null;
  validatorEmail?: string | null;
  validationNote?: string;
}) {
  const rows = readRows();
  const index = rows.findIndex((row) => row.id === input.contributionId);
  if (index < 0) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const current = rows[index];
  const isPending = current.status === "pending" && current.paymentStatusDetail === "awaiting_cash_confirmation";
  if (!isPending) {
    return { ok: false as const, reason: "not_pending" as const };
  }

  const validatedAt = new Date();
  const next: FallbackCashContribution = {
    ...current,
    status: input.decision === "approve" ? "approved" : "rejected",
    paymentStatusDetail:
      input.decision === "approve" ? "cash_validated_in_person" : "cash_validation_rejected",
    validatedBy: input.validatedBy,
    validatedAt,
    validationNote: input.validationNote?.trim() || null,
    validatorName: input.validatorName?.trim() || null,
    validatorEmail: input.validatorEmail?.trim() || null,
    updatedAt: validatedAt,
  };

  rows[index] = next;
  writeRows(rows);

  return {
    ok: true as const,
    status: next.status,
    contributionId: next.id,
  };
}
