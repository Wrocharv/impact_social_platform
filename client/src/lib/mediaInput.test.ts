import { describe, expect, it } from "vitest";

import { isYouTubeUrl, resolveMediaUrl } from "./mediaInput";

describe("media input helpers", () => {
  it("prioriza o valor digitado sobre o upload e o YouTube", () => {
    expect(resolveMediaUrl("https://cdn.exemplo.com/foto.jpg", "https://upload.exemplo.com/foto.jpg", "https://www.youtube.com/watch?v=abc123")).toBe("https://cdn.exemplo.com/foto.jpg");
  });

  it("usa o upload quando o campo está vazio", () => {
    expect(resolveMediaUrl("", "https://upload.exemplo.com/video.mp4", "https://www.youtube.com/watch?v=abc123")).toBe("https://upload.exemplo.com/video.mp4");
  });

  it("reconhece links do YouTube", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc123")).toBe(true);
    expect(isYouTubeUrl("https://cdn.exemplo.com/arquivo.mp4")).toBe(false);
  });
});
