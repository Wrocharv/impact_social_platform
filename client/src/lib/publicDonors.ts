export type PublicDonor = {
  id: number;
  donorName: string | null;
  donorCity: string | null;
  type: "financial" | "material" | "volunteer";
  description: string | null;
  campaignId: number | null;
  campaignTitle: string | null;
};

export type DonorGroup = {
  key: string;
  campaignId: number | null;
  title: string;
  donors: PublicDonor[];
};

export const SEM_CAMPANHA = "outras";

/**
 * Agrupa o mural por campanha: cada campanha mostra os seus doadores.
 * Nenhum valor entra aqui — o mural reconhece quem doou, nunca quanto.
 */
export function groupByCampaign(donors: PublicDonor[]): DonorGroup[] {
  const groups = new Map<string, DonorGroup>();

  for (const donor of donors) {
    const key = donor.campaignId ? String(donor.campaignId) : SEM_CAMPANHA;
    const existing = groups.get(key);
    if (existing) {
      existing.donors.push(donor);
      continue;
    }
    groups.set(key, {
      key,
      campaignId: donor.campaignId,
      title: donor.campaignTitle?.trim() || "Outras contribuições",
      donors: [donor],
    });
  }

  // Campanha com mais doadores primeiro; "outras" sempre por último.
  return Array.from(groups.values()).sort((left, right) => {
    if (left.key === SEM_CAMPANHA) return 1;
    if (right.key === SEM_CAMPANHA) return -1;
    return right.donors.length - left.donors.length;
  });
}
