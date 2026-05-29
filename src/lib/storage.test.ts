import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Song } from "@/types/music";

// Mock the Supabase storage client so we can drive createSignedUrl and assert
// how many times the network sign is actually attempted.
const createSignedUrl = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: (...args: unknown[]) => createSignedUrl(...args),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
      }),
    },
  },
}));

import { resolveAudioUrl, getCachedAudioUrl, prefetchAudioUrl } from "@/lib/storage";

const song = (file_path: string): Song => ({
  id: `id-${file_path}`,
  title: "t",
  artist: "",
  file_path,
  cover_image: null,
  lyrics: null,
  play_from: 0,
  end_at: null,
  tag_id: null,
  status: "active",
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("storage signed-URL cache", () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
  });

  describe("getCachedAudioUrl", () => {
    it("returns null on a cold cache (cache miss)", () => {
      expect(getCachedAudioUrl(song("cold-miss.mp3"))).toBeNull();
    });

    it("passes through a full http(s) URL synchronously without signing", () => {
      const s = song("https://example.com/track.mp3");
      expect(getCachedAudioUrl(s)).toBe("https://example.com/track.mp3");
      expect(createSignedUrl).not.toHaveBeenCalled();
    });

    it("returns the cached signed URL synchronously after resolveAudioUrl warms it", async () => {
      createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/warm.mp3" }, error: null });
      const s = song("warm.mp3");
      expect(getCachedAudioUrl(s)).toBeNull(); // cold
      const url = await resolveAudioUrl(s);
      expect(url).toBe("https://signed/warm.mp3");
      // Now synchronously available — no further sign call required.
      expect(getCachedAudioUrl(s)).toBe("https://signed/warm.mp3");
      expect(createSignedUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe("prefetchAudioUrl", () => {
    it("warms the cache so a later getCachedAudioUrl is a synchronous hit", async () => {
      createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/next.mp3" }, error: null });
      const s = song("next.mp3");
      expect(getCachedAudioUrl(s)).toBeNull();
      prefetchAudioUrl(s);
      await flush();
      expect(getCachedAudioUrl(s)).toBe("https://signed/next.mp3");
      expect(createSignedUrl).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when already cached (does not re-sign)", async () => {
      createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/already.mp3" }, error: null });
      const s = song("already.mp3");
      await resolveAudioUrl(s); // warm
      createSignedUrl.mockClear();
      prefetchAudioUrl(s);
      await flush();
      expect(createSignedUrl).not.toHaveBeenCalled();
    });

    it("never throws and never re-signs for null / external songs", async () => {
      expect(() => prefetchAudioUrl(null)).not.toThrow();
      prefetchAudioUrl(song("https://example.com/external.mp3"));
      await flush();
      expect(createSignedUrl).not.toHaveBeenCalled();
    });

    it("swallows sign failures instead of rejecting", async () => {
      createSignedUrl.mockResolvedValue({ data: null, error: new Error("boom") });
      const s = song("fails.mp3");
      // Should not throw / reject.
      prefetchAudioUrl(s);
      await flush();
      expect(getCachedAudioUrl(s)).toBeNull(); // stayed cold
    });
  });
});
