import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Song } from "@/types/music";

// PlayerContext talks to Supabase, signed-URL storage, and the auth context.
// Stub all three so we can exercise the pure queue/shuffle/playback logic.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ data: null, error: null }) }) },
}));
vi.mock("@/lib/storage", () => ({
  resolveAudioUrl: () => Promise.resolve("blob:fake-audio"),
  coverUrl: () => "",
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

import { PlayerProvider, usePlayer } from "@/contexts/PlayerContext";

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
});
