import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type FallbackMaterialContribution = {
  id: number;
  campaignId: number;
  campaignNeedId: number | null;
  donorName: string | null;
  donorEmail: string | null;
  donorWhatsapp: string | null;
  donorCity: string | null;
  description: string;
  quantity: string | null;
  quantityExact: number | null;
  estimatedAmount: number | null;
  deliveryMethod: string | null;
  materialDeliveryFrequency: string | null;
  status: "pending" | "approved" | "rejected";
  paymentStatusDetail: "awaiting_triage" | "material_validated" | "material_rejected";
  validatedBy: number | null;
  validatedAt: Date | null;
  validationNote: string | null;
  validatorName: string | null;
  validatorEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PersistedFallbackMaterialContribution = Omit<FallbackMaterialContribution, "createdAt" | "updatedAt" | "validatedAt"> & {
  createdAt: string;
  updatedAt: string;
  validatedAt: string | null;
};

const fallbackMaterialFile = path.resolve(process.cwd(), "server", ".material-validations-fallback.json");
const TRACKED_MATERIAL_STATUSES = new Set(["pending", "approved", "completed"]);

function normalizeWhatsapp(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function loadFromDisk(): FallbackMaterialContribution[] {
  try {
    if (!existsSync(fallbackMaterialFile)) return [];

    const raw = readFileSync(fallbackMaterialFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => {
      const row = item as PersistedFallbackMaterialContribution;
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

function persist(rows: FallbackMaterialContribution[]) {
  mkdirSync(path.dirname(fallbackMaterialFile), { recursive: true });
  const payload: PersistedFallbackMaterialContribution[] = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
  }));
  writeFileSync(fallbackMaterialFile, JSON.stringify(payload, null, 2));
}

function readRows() {
  return loadFromDisk();
}

function writeRows(rows: FallbackMaterialContribution[]) {
  persist(rows);
}

export function getFallbackMaterialTrackedQuantityForNeed(input: {
  campaignId: number;
  campaignNeedId: number;
}) {
  return readRows()
    .filter((row) => {
      if (row.campaignId !== input.campaignId) return false;
      if (row.campaignNeedId !== input.campaignNeedId) return false;
      return TRACKED_MATERIAL_STATUSES.has(row.status);
    })
    .reduce((sum, row) => sum + Math.max(0, row.quantityExact ?? 0), 0);
}

export function hasFallbackMaterialDonationForNeed(input: {
  campaignId: number;
  campaignNeedId: number;
  donorEmail?: string;
  donorWhatsapp?: string;
}) {
  const email = input.donorEmail?.trim().toLowerCase() ?? "";
  const whatsapp = normalizeWhatsapp(input.donorWhatsapp);

  if (!email && !whatsapp) {
    return false;
  }

  return readRows().some((row) => {
    if (row.campaignId !== input.campaignId) return false;
    if (row.campaignNeedId !== input.campaignNeedId) return false;
    if (!TRACKED_MATERIAL_STATUSES.has(row.status)) return false;

    const sameEmail = email.length > 0 && (row.donorEmail?.trim().toLowerCase() ?? "") === email;
    const sameWhatsapp = whatsapp.length > 0 && normalizeWhatsapp(row.donorWhatsapp) === whatsapp;

    return sameEmail || sameWhatsapp;
  });
}

export function createFallbackMaterialContribution(input: {
  campaignId: number;
  campaignNeedId?: number;
  donorName?: string;
  donorEmail?: string;
  donorWhatsapp?: string;
  donorCity?: string;
  description: string;
  quantity?: string;
  quantityExact?: number;
  estimatedAmount?: number;
  deliveryMethod?: string;
  materialDeliveryFrequency?: string;
}) {
  const rows = readRows();
  const nextId = rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 710001;
  const now = new Date();

  const contribution: FallbackMaterialContribution = {
    id: nextId,
    campaignId: input.campaignId,
    campaignNeedId: input.campaignNeedId ?? null,
    donorName: input.donorName?.trim() || null,
    donorEmail: input.donorEmail?.trim().toLowerCase() || null,
    donorWhatsapp: normalizeWhatsapp(input.donorWhatsapp) || null,
    donorCity: input.donorCity?.trim() || null,
    description: input.description.trim(),
    quantity: input.quantity?.trim() || null,
    quantityExact: Number.isInteger(input.quantityExact) ? input.quantityExact ?? null : null,
    estimatedAmount: Number.isInteger(input.estimatedAmount) ? input.estimatedAmount ?? null : null,
    deliveryMethod: input.deliveryMethod?.trim() || null,
    materialDeliveryFrequency: input.materialDeliveryFrequency?.trim() || null,
    status: "pending",
    paymentStatusDetail: "awaiting_triage",
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

export function listFallbackPendingMaterialValidations(campaignId?: number) {
  return readRows()
    .filter((row) => {
      if (campaignId && row.campaignId !== campaignId) return false;
      return row.status === "pending" && row.paymentStatusDetail === "awaiting_triage";
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      campaignNeedId: row.campaignNeedId,
      donorName: row.donorName,
      donorEmail: row.donorEmail,
      donorWhatsapp: row.donorWhatsapp,
      donorCity: row.donorCity,
      description: row.description,
      quantity: row.quantity,
      quantityExact: row.quantityExact,
      estimatedAmount: row.estimatedAmount,
      createdAt: row.createdAt,
      paymentStatusDetail: row.paymentStatusDetail,
    }));
}

export function listFallbackRecentMaterialValidations(input?: { campaignId?: number; limit?: number }) {
  return readRows()
    .filter((row) => {
      if (input?.campaignId && row.campaignId !== input.campaignId) return false;
      return row.paymentStatusDetail === "material_validated" || row.paymentStatusDetail === "material_rejected";
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
      campaignNeedId: row.campaignNeedId,
      donorName: row.donorName,
      donorEmail: row.donorEmail,
      description: row.description,
      quantity: row.quantity,
      quantityExact: row.quantityExact,
      estimatedAmount: row.estimatedAmount,
      status: row.status,
      paymentStatusDetail: row.paymentStatusDetail,
      validatedBy: row.validatedBy,
      validatedAt: row.validatedAt,
      validationNote: row.validationNote,
      validatorName: row.validatorName,
      validatorEmail: row.validatorEmail,
    }));
}

export function listFallbackTrackedMaterialContributions(campaignId?: number) {
  return readRows()
    .filter((row) => {
      if (campaignId && row.campaignId !== campaignId) return false;
      return TRACKED_MATERIAL_STATUSES.has(row.status);
    })
    .map((row) => ({
      campaignId: row.campaignId,
      campaignNeedId: row.campaignNeedId,
      quantityExact: row.quantityExact,
      estimatedAmount: row.estimatedAmount,
    }));
}

export function reviewFallbackMaterialContribution(input: {
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
  const isPending = current.status === "pending" && current.paymentStatusDetail === "awaiting_triage";
  if (!isPending) {
    return { ok: false as const, reason: "not_pending" as const };
  }

  const validatedAt = new Date();
  const next: FallbackMaterialContribution = {
    ...current,
    status: input.decision === "approve" ? "approved" : "rejected",
    paymentStatusDetail: input.decision === "approve" ? "material_validated" : "material_rejected",
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