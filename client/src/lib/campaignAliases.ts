// A campanha "Construção Hotel Recanto de Paz" é acessível por dois IDs públicos
// (1 e 100001) que apontam para o mesmo registro no banco — ver HOTEL_CAMPAIGN_ID
// em ContributionVipPage.tsx / ContributionWizardPage.tsx.
const RECANTO_CAMPAIGN_ALIAS_IDS: readonly number[] = [1, 100001];

export function isSameCampaignForMonthlyGiving(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  return RECANTO_CAMPAIGN_ALIAS_IDS.includes(a) && RECANTO_CAMPAIGN_ALIAS_IDS.includes(b);
}
