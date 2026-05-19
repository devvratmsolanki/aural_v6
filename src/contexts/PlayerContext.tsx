import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveAudioUrl } from "@/lib/storage";
import type { Song } from "@/types/music";
import { useAuth } from "./AuthContext";

interface PlayerCtx {
  current: Song | null;
  queue: Song[];
  index: number;
  isPlaying: boolean;
  shuffle: boolean;
  loop: boolean;
  duration: number;
  position: number;
  volume: number;
  playSong: (song: Song, list?: Song[]) => Promise<void>;
  playShuffle: (list: Song[]) => Promise<void>;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  toggleLoop: () => void;
}

const Ctx = createContext<PlayerCtx | undefined>(undefined);

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [index, setIndex] = useState(-1);
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolumeState] = useState(0.8);

  const current = index >= 0 ? queue[index] ?? null : null;

  // init audio element once
  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    el.volume = volume;
    audioRef.current = el;
    const onTime = () => setPosition(el.currentTime);
    const onLoaded = () => setDuration(el.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      // handled by next() via effect
      setIsPlaying(false);
      // trigger next via custom event
      window.dispatchEvent(new CustomEvent("aural:ended"));
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.pause();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logHistory = useCallback(async (song: Song) => {
    if (!user) return;
    await supabase.from("play_history").insert({ user_id: user.id, song_id: song.id });
  }, [user]);

  const loadAndPlay = useCallback(async (song: Song) => {
    const el = audioRef.current;
    if (!el) return;
    try {
      const url = await resolveAudioUrl(song);
      el.src = url;
      const start = song.play_from || 0;
      el.currentTime = start;
      setPosition(start);
      await el.play();
      logHistory(song);
    } catch (e) {
      console.error("playback error", e);
    }
  }, [logHistory]);

  const playSong = useCallback(async (song: Song, list?: Song[]) => {
    const newQueue = list && list.length ? list : [song];
    const newIndex = newQueue.findIndex((s) => s.id === song.id);
    setQueue(newQueue);
    setShuffleHistory([]);
    setIndex(newIndex >= 0 ? newIndex : 0);
    await loadAndPlay(newQueue[newIndex >= 0 ? newIndex : 0]);
  }, [loadAndPlay]);

  const playShuffle = useCallback(async (list: Song[]) => {
    if (!list.length) return;
    setShuffle(true);
    setShuffleHistory([]);
    const n = Math.floor(Math.random() * list.length);
    setQueue(list);
    setIndex(n);
    await loadAndPlay(list[n]);
  }, [loadAndPlay]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (el.paused) el.play(); else el.pause();
  }, [current]);

  const next = useCallback(() => {
    if (queue.length === 0) return;
    let n: number;
    if (shuffle) {
      setShuffleHistory((h) => [...h, index]);
      n = Math.floor(Math.random() * queue.length);
      if (n === index && queue.length > 1) n = (n + 1) % queue.length;
    } else {
      n = (index + 1) % queue.length;
    }
    setIndex(n);
    loadAndPlay(queue[n]);
  }, [queue, index, shuffle, loadAndPlay]);

  const prev = useCallback(() => {
    if (queue.length === 0) return;
    if (shuffle && shuffleHistory.length > 0) {
      const prev = shuffleHistory[shuffleHistory.length - 1];
      setShuffleHistory((h) => h.slice(0, -1));
      setIndex(prev);
      loadAndPlay(queue[prev]);
      return;
    }
    const n = index - 1 < 0 ? queue.length - 1 : index - 1;
    setIndex(n);
    loadAndPlay(queue[n]);
  }, [queue, index, shuffle, shuffleHistory, loadAndPlay]);

  // auto-next on ended
  useEffect(() => {
    const handler = () => {
      if (loop && current) {
        const el = audioRef.current!;
        el.currentTime = current.play_from || 0;
        el.play();
      } else {
        next();
      }
    };
    window.addEventListener("aural:ended", handler);
    return () => window.removeEventListener("aural:ended", handler);
  }, [next, loop, current]);

  // enforce end_at — read live audio time to avoid stale React state firing
  // ended right after a song change (which would skip the new song)
  useEffect(() => {
    if (!current?.end_at) return;
    const el = audioRef.current;
    if (!el || el.paused) return;
    if (el.currentTime >= current.end_at) {
      el.dispatchEvent(new Event("ended"));
    }
  }, [position, current]);

  // stop on logout — react to auth state and the custom event
  useEffect(() => {
    if (!user) audioRef.current?.pause();
  }, [user]);

  useEffect(() => {
    const handler = () => { audioRef.current?.pause(); };
    window.addEventListener("aural:stop", handler);
    return () => window.removeEventListener("aural:stop", handler);
  }, []);

  const seek = (s: number) => {
    if (audioRef.current) audioRef.current.currentTime = s;
  };
  const setVolume = (v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  return (
    <Ctx.Provider
      value={{
        current, queue, index, isPlaying, shuffle, loop, duration, position, volume,
        playSong, playShuffle, toggle, next, prev, seek, setVolume,
        toggleShuffle: () => setShuffle((s) => !s),
        toggleLoop: () => setLoop((s) => !s),
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const usePlayer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlayer must be used inside PlayerProvider");
  return c;
};
