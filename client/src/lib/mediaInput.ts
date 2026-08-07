export function resolveMediaUrl(urlValue: string, uploadedValue?: string, youtubeValue?: string): string | undefined {
  const directValue = urlValue?.trim();
  if (directValue) {
    return directValue;
  }

  const uploadValue = uploadedValue?.trim();
  if (uploadValue) {
    return uploadValue;
  }

  const youtubeValueTrimmed = youtubeValue?.trim();
  return youtubeValueTrimmed || undefined;
}

export function isYouTubeUrl(value: string) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.includes("youtube.com") || normalized.includes("youtu.be");
}
