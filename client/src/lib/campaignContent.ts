export type CampaignContent = {
  title: string;
  subtitle: string;
  description: string;
  longDescription: string;
  heroImageUrl: string;
  galleryImageUrls: string[];
  videoUrls: string[];
};

export const DEFAULT_CAMPAIGN_CONTENT: CampaignContent = {
  title: "",
  subtitle: "",
  description: "",
  longDescription: "",
  heroImageUrl: "",
  galleryImageUrls: [],
  videoUrls: [],
};
