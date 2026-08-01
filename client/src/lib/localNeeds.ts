type LocalNeedPriority = "high" | "medium" | "low";
type LocalNeedType = "material" | "labor" | "equipment" | "other";

export type LocalNeed = {
  id: number;
  campaignId: number;
  type: LocalNeedType;
  name: string;
  description?: string;
  quantity: string;
  targetQuantityExact?: number | null;
  unitValueCents?: number | null;
  priority: LocalNeedPriority;
};

export type LocalNeedProgress = {
  campaignId: number;
  needId: number;
  offeredQuantity: number;
  offeredValueCents: number;
};

const LOCAL_NEEDS_STORAGE_KEY = "admin-local-needs-v1";
const LOCAL_NEEDS_PROGRESS_STORAGE_KEY = "admin-local-needs-progress-v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAllLocalNeeds(): LocalNeed[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_NEEDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is LocalNeed => {
      if (!item || typeof item !== "object") return false;
      if (typeof item.id !== "number" || !Number.isFinite(item.id)) return false;
      if (typeof item.campaignId !== "number" || !Number.isFinite(item.campaignId)) return false;
      if (typeof item.name !== "string" || item.name.trim().length < 1) return false;
      if (typeof item.quantity !== "string" || item.quantity.trim().length < 1) return false;
      if (item.priority !== "high" && item.priority !== "medium" && item.priority !== "low") return false;
      if (item.type !== "material" && item.type !== "labor" && item.type !== "equipment" && item.type !== "other") return false;
      return true;
    });
  } catch {
    return [];
  }
}

function writeAllLocalNeeds(needs: LocalNeed[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LOCAL_NEEDS_STORAGE_KEY, JSON.stringify(needs));
}

export function readLocalNeedsForCampaign(campaignId: number): LocalNeed[] {
  return readAllLocalNeeds().filter((need) => need.campaignId === campaignId);
}

export function saveLocalNeed(input: Omit<LocalNeed, "id">): LocalNeed {
  const all = readAllLocalNeeds();
  const maxId = all.reduce((max, need) => Math.max(max, need.id), 0);
  const next: LocalNeed = {
    ...input,
    id: Math.max(maxId + 1, Date.now()),
  };
  writeAllLocalNeeds([...all, next]);
  return next;
}

function readAllLocalNeedsProgress(): LocalNeedProgress[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_NEEDS_PROGRESS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is LocalNeedProgress => {
      if (!item || typeof item !== "object") return false;
      if (typeof item.campaignId !== "number" || !Number.isFinite(item.campaignId)) return false;
      if (typeof item.needId !== "number" || !Number.isFinite(item.needId)) return false;
      if (typeof item.offeredQuantity !== "number" || !Number.isFinite(item.offeredQuantity)) return false;
      if (typeof item.offeredValueCents !== "number" || !Number.isFinite(item.offeredValueCents)) return false;
      return true;
    });
  } catch {
    return [];
  }
}

function writeAllLocalNeedsProgress(progress: LocalNeedProgress[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LOCAL_NEEDS_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function readLocalNeedProgressForCampaign(campaignId: number): Map<number, LocalNeedProgress> {
  const rows = readAllLocalNeedsProgress().filter((item) => item.campaignId === campaignId);
  const map = new Map<number, LocalNeedProgress>();
  rows.forEach((item) => map.set(item.needId, item));
  return map;
}

export function addLocalNeedProgress(input: {
  campaignId: number;
  needId: number;
  quantity: number;
  valueCents: number;
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return;

  const all = readAllLocalNeedsProgress();
  const index = all.findIndex(
    (item) => item.campaignId === input.campaignId && item.needId === input.needId,
  );

  if (index >= 0) {
    const current = all[index];
    all[index] = {
      ...current,
      offeredQuantity: Math.max(0, current.offeredQuantity + input.quantity),
      offeredValueCents: Math.max(0, current.offeredValueCents + Math.max(0, input.valueCents || 0)),
    };
  } else {
    all.push({
      campaignId: input.campaignId,
      needId: input.needId,
      offeredQuantity: Math.max(0, input.quantity),
      offeredValueCents: Math.max(0, input.valueCents || 0),
    });
  }

  writeAllLocalNeedsProgress(all);
}
