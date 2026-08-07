export type PublicNeed = {
  id: number;
  name: string;
  quantity: string | null;
  priority: "high" | "medium" | "low";
  targetQuantityExact?: number | null;
  unitValueCents?: number | null;
  offeredQuantity?: number | null;
  remainingQuantity?: number | null;
  offeredValueCents?: number | null;
  remainingValueCents?: number | null;
  fulfilled?: number | null;
};

export type PublicNeedProgress = {
  campaignId: number;
  needId: number;
  offeredQuantity: number;
  offeredValueCents: number;
};

function normalizeNeedLabel(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function findMatchingServerNeed(serverNeeds: PublicNeed[], need: PublicNeed) {
  const sameId = serverNeeds.find((serverNeed) => serverNeed.id === need.id);
  if (sameId) return sameId;

  const normalizedName = normalizeNeedLabel(need.name);
  return serverNeeds.find((serverNeed) => normalizeNeedLabel(serverNeed.name) === normalizedName);
}

export function buildPublicNeedsList(
  serverNeeds: PublicNeed[],
  localProgress: Map<number, PublicNeedProgress>,
  localNeeds: PublicNeed[] = [],
) {
  const needsMergedMap = new Map<number, PublicNeed>();

  const mergeNeed = (sourceNeed: PublicNeed, baseNeed?: PublicNeed) => {
    const matchingServerNeed = baseNeed ?? findMatchingServerNeed(serverNeeds, sourceNeed);
    const progress = localProgress.get(sourceNeed.id) ?? (matchingServerNeed ? localProgress.get(matchingServerNeed.id) : undefined);
    const baseOfferedQuantity = Math.max(0, matchingServerNeed?.offeredQuantity ?? 0);
    const baseOfferedValueCents = Math.max(0, matchingServerNeed?.offeredValueCents ?? 0);
    const targetQuantity = Math.max(0, sourceNeed.targetQuantityExact ?? matchingServerNeed?.targetQuantityExact ?? 0);
    const unitValueCents = Math.max(0, sourceNeed.unitValueCents ?? matchingServerNeed?.unitValueCents ?? 0);
    const offeredQuantity = baseOfferedQuantity + Math.max(0, progress?.offeredQuantity ?? 0);
    const offeredValueCents = baseOfferedValueCents + Math.max(0, progress?.offeredValueCents ?? 0);
    const remainingQuantity = Math.max(0, targetQuantity - offeredQuantity);
    const remainingValueCents = Math.max(0, remainingQuantity * unitValueCents);

    const mergedNeed = {
      ...(matchingServerNeed ?? {}),
      ...sourceNeed,
      id: sourceNeed.id,
      offeredQuantity,
      offeredValueCents,
      remainingQuantity,
      remainingValueCents,
    } as PublicNeed;

    const mapKey = matchingServerNeed?.id ?? sourceNeed.id;
    needsMergedMap.set(mapKey, mergedNeed);
  };

  serverNeeds.forEach((need) => {
    mergeNeed(need);
  });

  localNeeds.forEach((need) => {
    const matchingServerNeed = findMatchingServerNeed(serverNeeds, need);
    mergeNeed(need, matchingServerNeed);
  });

  return Array.from(needsMergedMap.values());
}
