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
      if (song.play_from) el.currentTime = song.play_from;
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
    setIndex(newIndex >= 0 ? newIndex : 0);
    await loadAndPlay(newQueue[newIndex >= 0 ? newIndex : 0]);
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
      n = Math.floor(Math.random() * queue.length);
    } else {
      n = index + 1 >= queue.length ? (loop ? 0 : -1) : index + 1;
    }
    if (n === -1) {
      audioRef.current?.pause();
      return;
    }
    setIndex(n);
    loadAndPlay(queue[n]);
  }, [queue, index, shuffle, loop, loadAndPlay]);

  const prev = useCallback(() => {
    if (queue.length === 0) return;
    const n = index - 1 < 0 ? queue.length - 1 : index - 1;
    setIndex(n);
    loadAndPlay(queue[n]);
  }, [queue, index, loadAndPlay]);

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

  // enforce end_at
  useEffect(() => {
    if (!current?.end_at) return;
    if (position >= current.end_at) {
      audioRef.current?.dispatchEvent(new Event("ended"));
    }
  }, [position, current]);

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
        playSong, toggle, next, prev, seek, setVolume,
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
