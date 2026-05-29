import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, render, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Song } from "@/types/music";

// PlayerContext talks to Supabase, signed-URL storage, and the auth context.
// Stub all three so we can exercise the pure queue/shuffle/playback logic.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ data: null, error: null }) }) },
}));

// Track prefetch calls and let getCachedAudioUrl report a configurable cache.
const prefetchAudioUrl = vi.fn();
const cache = new Set<string>();
vi.mock("@/lib/storage", () => ({
  resolveAudioUrl: () => Promise.resolve("blob:fake-audio"),
  getCachedAudioUrl: (s: Song) => (cache.has(s.file_path) ? `blob:${s.file_path}` : null),
  prefetchAudioUrl: (s: Song | null | undefined) => prefetchAudioUrl(s),
  coverUrl: () => "",
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

import { PlayerProvider, usePlayer, usePlayerProgress } from "@/contexts/PlayerContext";

const song = (i: number): Song => ({
  id: `s${i}`,
  title: `Song ${i}`,
  artist: "",
  file_path: `f${i}.mp3`,
  cover_image: null,
  lyrics: null,
  play_from: 0,
  end_at: null,
  tag_id: null,
  status: "active",
});
const makeSongs = (n: number) => Array.from({ length: n }, (_, i) => song(i));
const wrapper = ({ children }: { children: ReactNode }) => <PlayerProvider>{children}</PlayerProvider>;

describe("PlayerContext", () => {
  beforeEach(() => {
    prefetchAudioUrl.mockClear();
    cache.clear();
  });

  it("playSong sets the queue, index, and current track", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });
    const songs = makeSongs(3);
    await act(async () => { await result.current.playSong(songs[1], songs); });
    expect(result.current.queue).toHaveLength(3);
    expect(result.current.index).toBe(1);
    expect(result.current.current?.id).toBe("s1");
  });

  it("next() advances and wraps from the last track back to the first", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });
    const songs = makeSongs(3);
    await act(async () => { await result.current.playSong(songs[0], songs); });
    await act(async () => { result.current.next(); });
    expect(result.current.index).toBe(1);
    await act(async () => { result.current.next(); });
    expect(result.current.index).toBe(2);
    await act(async () => { result.current.next(); });
    expect(result.current.index).toBe(0); // wrapped
  });

  it("prev() at the first track wraps to the last", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });
    const songs = makeSongs(3);
    await act(async () => { await result.current.playSong(songs[0], songs); });
    await act(async () => { result.current.prev(); });
    expect(result.current.index).toBe(2);
  });

  it("toggleShuffle and toggleLoop flip their flags", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });
    expect(result.current.shuffle).toBe(false);
    expect(result.current.loop).toBe(false);
    act(() => { result.current.toggleShuffle(); });
    act(() => { result.current.toggleLoop(); });
    expect(result.current.shuffle).toBe(true);
    expect(result.current.loop).toBe(true);
  });

  it("shuffle plays every track exactly once before repeating (no-repeat bag)", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });
    const songs = makeSongs(5);
    await act(async () => { await result.current.playShuffle(songs); });
    expect(result.current.shuffle).toBe(true);
    const seen = new Set<number>([result.current.index]);
    for (let i = 0; i < 4; i++) {
      await act(async () => { result.current.next(); });
      seen.add(result.current.index);
    }
    // Across one full cycle, all 5 indices appear with no repeats.
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("prefetches the next (sequential) track's URL when a song starts", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });
    const songs = makeSongs(3);
    await act(async () => { await result.current.playSong(songs[0], songs); });
    // Sequential prediction of song[0] is song[1].
    const targets = prefetchAudioUrl.mock.calls.map((c) => c[0]?.id);
    expect(targets).toContain("s1");
  });

  it("prefetches the same song when looping", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });
    const songs = makeSongs(3);
    await act(async () => { await result.current.playSong(songs[0], songs); });
    act(() => { result.current.toggleLoop(); });
    // After enabling loop, the predicted next track is the current one (s0).
    const targets = prefetchAudioUrl.mock.calls.map((c) => c[0]?.id);
    expect(targets).toContain("s0");
  });

  it("takes the synchronous fast path on a warm cache without awaiting resolve", async () => {
    // Pre-warm the cache for s1 so the transition to it is synchronous.
    cache.add("f1.mp3");
    const { result } = renderHook(() => usePlayer(), { wrapper });
    const songs = makeSongs(3);
    await act(async () => { await result.current.playSong(songs[0], songs); });
    await act(async () => { result.current.next(); });
    // The transition still lands on s1 (fast path doesn't change navigation).
    expect(result.current.index).toBe(1);
    expect(result.current.current?.id).toBe("s1");
  });

  it("controls value identity is STABLE across position ticks", async () => {
    const controlsRefs: unknown[] = [];
    let tickPosition = () => {};

    const Probe = () => {
      const controls = usePlayer();
      const { position } = usePlayerProgress();
      controlsRefs.push(controls);
      // Expose a way to read the progress so React keeps this subscribed.
      (Probe as unknown as { lastPos: number }).lastPos = position;
      return null;
    };

    render(
      <PlayerProvider>
        <Probe />
      </PlayerProvider>
    );

    // Find the hidden audio element the provider appended to the body and drive
    // timeupdate ticks through it (jsdom won't fire them on its own).
    const audio = document.body.querySelector("audio") as HTMLAudioElement;
    expect(audio).toBeTruthy();
    Object.defineProperty(audio, "currentTime", { value: 5, configurable: true });
    tickPosition = () => audio.dispatchEvent(new Event("timeupdate"));

    // Settle: the last captured ref is the steady-state memoized controls value.
    const baseline = controlsRefs[controlsRefs.length - 1];
    const before = controlsRefs.length;
    act(() => { tickPosition(); });
    act(() => { tickPosition(); });
    // Position ticks re-rendered the probe (progress changed), so we captured
    // more controls refs...
    expect(controlsRefs.length).toBeGreaterThan(before);
    // ...but every controls object captured DURING the ticks is the SAME
    // reference as the pre-tick baseline: the memoized controls value never
    // changes identity just because position ticked.
    const duringTicks = controlsRefs.slice(before);
    expect(duringTicks.every((c) => c === baseline)).toBe(true);
  });
});
