export type CampaignLike = {
  id?: number;
  title?: string | null;
};

export function normalizeCampaignTitleKey(title: string | null | undefined) {
  return String(title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function isLegendarioCampaign(campaign: CampaignLike) {
  const normalizedTitle = normalizeCampaignTitleKey(campaign.title);

  return campaign.id === 100002
    || normalizedTitle.includes("legendario solidario")
    || normalizedTitle.includes("irma valdelice")
    || normalizedTitle.includes("legendario");
}
