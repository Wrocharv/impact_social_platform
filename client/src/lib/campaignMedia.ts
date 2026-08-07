export function resolveCampaignImageUrl(value: string | undefined | null, uploadedUrl?: string | null): string | undefined {
  const directValue = value?.trim();
  if (directValue) {
    return directValue;
  }

  const uploadedValue = uploadedUrl?.trim();
  return uploadedValue || undefined;
}
