import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveAudioUrl, coverUrl } from "@/lib/storage";
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
  // The user's *intent* to be playing. Distinct from `isPlaying`, which mirrors
  // the element's real state and gets flipped to false when a mobile browser
  // pauses us in the background — we must not treat that as "user paused".
  const wantsToPlayRef = useRef(false);
  // Id of the song whose end_at has already fired `ended`, so a stray
  // timeupdate tick during the song transition can't fire it twice (which
  // would instantly skip the next song). Cleared on each new load / loop rewind.
  const endAtFiredForRef = useRef<string | null>(null);
  // Refs read by the (mount-once) audio `error` handler, which can't close over
  // reactive state. Used to re-sign an expired signed URL and resume in place.
  const currentRef = useRef<Song | null>(null);
  const lastPositionRef = useRef(0);
  const lastRecoverAtRef = useRef(0);
  // Timer ref for the 4-second minimum-listen guard before logging play history.
  // Cleared on every new loadAndPlay call so rapid skips don't produce spurious rows.
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [index, setIndex] = useState(-1);
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([]);
  // Unplayed indices for the current shuffle cycle. Drains to [] across the
  // cycle; when empty, next() rebuilds it (Fisher-Yates over all indices) so
  // no song repeats until every song in the queue has played once.
  const [shuffleBag, setShuffleBag] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolumeState] = useState(0.8);

  const current = index >= 0 ? queue[index] ?? null : null;

  // Fully-guarded Media Session metadata setter. Called both from the render
  // effect AND eagerly from loadAndPlay, so the lock-screen controls + title
  // appear the instant playback starts (the gesture turn) rather than a render
  // cycle later — which is what keeps the media session "active" across a
  // screen-lock. Every step is wrapped so an unsupported MediaMetadata or a
  // bad artwork entry can never break playback.
  const applyMediaMetadata = useCallback((song: Song) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (typeof MediaMetadata === "undefined") return;
    try {
      const art = song.cover_image ? coverUrl(song.cover_image) : "";
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || "",
        artist: song.artist || "",
        album: "AURAL",
        artwork: art ? [{ src: art, sizes: "512x512", type: "image/png" }] : [],
      });
    } catch { /* ignore */ }
  }, []);

  // init audio element once
  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    // Hint to mobile browsers that this is inline media playback, not a
    // fullscreen video — keeps the element eligible to play in the background.
    el.setAttribute("playsinline", "");
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    el.volume = volume;
    // Attach the element to the DOM (hidden). A detached `new Audio()` is
    // treated less reliably by some mobile browsers for background / locked-
    // screen playback; an in-document media element is more likely to hold its
    // audio focus when the page is frozen. Removed again on cleanup.
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    try { document.body.appendChild(el); } catch { /* SSR / no body */ }
    audioRef.current = el;
    // Auto-resume throttle. A background pause can fire repeatedly, and a
    // genuinely dead stream must not spin forever — so we cap retries and rate-
    // limit them. The budget resets on every successful (real) `play`.
    let resumeAttempts = 0;
    let lastResumeAt = 0;
    const onTime = () => { lastPositionRef.current = el.currentTime; setPosition(el.currentTime); };
    const onLoaded = () => setDuration(el.duration || 0);
    const onPlay = () => { setIsPlaying(true); resumeAttempts = 0; };
    const onEnded = () => {
      // handled by next() via effect
      setIsPlaying(false);
      // End-of-track: never auto-resume here — block the pause handler's resume
      // and hand off to the aural:ended -> next()/loop flow.
      resumeAttempts = Number.POSITIVE_INFINITY;
      // trigger next via custom event
      window.dispatchEvent(new CustomEvent("aural:ended"));
    };
    const onPause = () => {
      setIsPlaying(false);
      // Guarded auto-resume: the OS/browser may pause our element when the
      // screen locks or the page is frozen in the background. Re-assert
      // playback only when the user still wants it and the track is mid-stream.
      if (!wantsToPlayRef.current) return;        // user/logout/stop paused on purpose
      if (el.ended) return;                       // natural end -> let next() run
      // If duration is known, don't resume at/after the end (where `ended` may
      // arrive a beat after this `pause`), or we'd replay a finished track and
      // fight next()/end_at.
      if (Number.isFinite(el.duration) && el.duration > 0 && el.currentTime >= el.duration - 0.5) return;
      // If this is a clipped track and we're within 0.5s of the clip end, don't
      // resume — the end_at enforcer will fire `ended` and hand off to next().
      const endAt = currentRef.current?.end_at;
      if (endAt != null && el.currentTime >= endAt - 0.5) return;
      const now = Date.now();
      if (now - lastResumeAt < 1000) return;      // throttle bursts
      if (resumeAttempts >= 5) return;            // give up on a dead stream
      resumeAttempts += 1;
      lastResumeAt = now;
      el.play().catch(() => { /* needs gesture / dead stream — ignore */ });
    };
    // A signed audio URL can expire mid-playback (cached ~55min, token ~60min);
    // the element then errors and stalls. Re-sign and resume from where we were.
    // Throttled so a genuinely broken file can't spin in a retry loop.
    const onError = () => {
      const song = currentRef.current;
      const code = el.error?.code;
      // Only attempt re-sign recovery for network errors (expired signed URL).
      // MEDIA_ERR_SRC_NOT_SUPPORTED is a decode/format error — re-signing the
      // URL won't help and would just spin a useless recovery loop.
      const recoverable = code === MediaError.MEDIA_ERR_NETWORK;
      if (!song || !wantsToPlayRef.current || !recoverable) return;
      if (/^https?:\/\//i.test(song.file_path)) return; // external URL, nothing to re-sign
      if (Date.now() - lastRecoverAtRef.current < 5000) return;
      lastRecoverAtRef.current = Date.now();
      const resumeAt = lastPositionRef.current;
      resolveAudioUrl(song, true)
        .then((url) => {
          el.src = url;
          el.currentTime = resumeAt;
          return el.play();
        })
        .catch((e) => console.error("audio recovery failed", e));
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    return () => {
      el.pause();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      try { el.remove(); } catch { /* ignore */ }
      if (historyTimerRef.current !== null) {
        clearTimeout(historyTimerRef.current);
        historyTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { currentRef.current = current; }, [current]);

  const logHistory = useCallback(async (song: Song) => {
    if (!user) return;
    await supabase.from("play_history").insert({ user_id: user.id, song_id: song.id });
  }, [user]);

  const loadAndPlay = useCallback(async (song: Song) => {
    const el = audioRef.current;
    if (!el) return;
    // Cancel any pending history log from a previous song (rapid skip guard).
    if (historyTimerRef.current !== null) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    try {
      // Set lock-screen metadata + playing state BEFORE the (async) play
      // resolves, while still inside the user-gesture turn. Android shows the
      // controls immediately and treats the session as active, which is what
      // lets audio survive the screen lock.
      wantsToPlayRef.current = true;
      applyMediaMetadata(song);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        try { navigator.mediaSession.playbackState = "playing"; } catch { /* ignore */ }
      }
      const url = await resolveAudioUrl(song);
      el.src = url;
      const start = song.play_from || 0;
      el.currentTime = start;
      setPosition(start);
      endAtFiredForRef.current = null;
      await el.play();
      // Only log play history after 4 s of continuous listening, so rapid skips
      // don't spam the table and pollute the "New" tab / analytics.
      historyTimerRef.current = setTimeout(() => {
        historyTimerRef.current = null;
        logHistory(song);
      }, 4000);
    } catch (e) {
      console.error("playback error", e);
    }
  }, [logHistory, applyMediaMetadata]);

  const playSong = useCallback(async (song: Song, list?: Song[]) => {
    const newQueue = list && list.length ? list : [song];
    const newIndex = newQueue.findIndex((s) => s.id === song.id);
    setQueue(newQueue);
    setShuffleHistory([]);
    setShuffleBag([]);
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
    // Seed the bag with every other index, Fisher-Yates shuffled, so the next
    // (list.length - 1) plays cover the rest of the queue with no repeats.
    const rest = Array.from({ length: list.length }, (_, i) => i).filter((i) => i !== n);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    setShuffleBag(rest);
    await loadAndPlay(list[n]);
  }, [loadAndPlay]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (el.paused) { wantsToPlayRef.current = true; el.play(); }
    else { wantsToPlayRef.current = false; el.pause(); }
  }, [current]);

  const next = useCallback(() => {
    if (queue.length === 0) return;
    let n: number;
    if (shuffle) {
      setShuffleHistory((h) => [...h, index]);
      if (queue.length === 1) {
        n = index;
      } else if (shuffleBag.length > 0) {
        n = shuffleBag[0];
        setShuffleBag((b) => b.slice(1));
      } else {
        // Cycle exhausted — refill the bag with every index except the current
        // one, Fisher-Yates shuffled. Pop the first as next, keep the rest.
        const rest = Array.from({ length: queue.length }, (_, i) => i).filter((i) => i !== index);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        n = rest[0];
        setShuffleBag(rest.slice(1));
      }
    } else {
      n = (index + 1) % queue.length;
    }
    setIndex(n);
    loadAndPlay(queue[n]);
  }, [queue, index, shuffle, shuffleBag, loadAndPlay]);

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
        // Allow end_at to fire again on the next loop pass.
        endAtFiredForRef.current = null;
        wantsToPlayRef.current = true;
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
    if (el.currentTime >= current.end_at && endAtFiredForRef.current !== current.id) {
      endAtFiredForRef.current = current.id;
      el.dispatchEvent(new Event("ended"));
    }
  }, [position, current]);

  // stop on logout — react to auth state and the custom event
  useEffect(() => {
    if (!user) { wantsToPlayRef.current = false; audioRef.current?.pause(); }
  }, [user]);

  useEffect(() => {
    const handler = () => { wantsToPlayRef.current = false; audioRef.current?.pause(); };
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

  // --- Media Session API ---------------------------------------------------
  // Registering metadata + action handlers makes mobile browsers treat the
  // page as an active media session. Without it the OS aggressively pauses /
  // throttles "background" audio once the screen locks or the device idles,
  // which is the root cause of playback stopping after a few minutes on
  // Android. This also wires up the lock-screen / notification controls.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    ms.setActionHandler("play", () => { wantsToPlayRef.current = true; audioRef.current?.play().catch(() => {}); });
    ms.setActionHandler("pause", () => { wantsToPlayRef.current = false; audioRef.current?.pause(); });
    ms.setActionHandler("previoustrack", () => prev());
    ms.setActionHandler("nexttrack", () => next());
    ms.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime);
    });
    ms.setActionHandler("seekforward", (details) => {
      const el = audioRef.current;
      if (el) seek(Math.min((el.duration || el.currentTime), el.currentTime + (details.seekOffset || 10)));
    });
    ms.setActionHandler("seekbackward", (details) => {
      const el = audioRef.current;
      if (el) seek(Math.max(0, el.currentTime - (details.seekOffset || 10)));
    });

    return () => {
      // Best-effort teardown; some browsers throw on unknown actions.
      (["play", "pause", "previoustrack", "nexttrack", "seekto", "seekforward", "seekbackward"] as const)
        .forEach((a) => { try { ms.setActionHandler(a, null); } catch { /* noop */ } });
    };
  }, [next, prev]);

  // Keep lock-screen metadata in sync with the current track.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!current) {
      try { navigator.mediaSession.metadata = null; } catch { /* ignore */ }
      return;
    }
    applyMediaMetadata(current);
  }, [current, applyMediaMetadata]);

  // Mirror play/pause into the OS media session so the lock-screen control
  // shows the right state. (Driven by the React `isPlaying` state, which the
  // audio element's play/pause events update.)
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Report playback position so the lock-screen scrubber tracks correctly.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    if (!current || !duration || !isFinite(duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(position, duration),
        playbackRate: audioRef.current?.playbackRate || 1,
      });
    } catch { /* setPositionState throws if values are inconsistent — ignore */ }
  }, [position, duration, current]);

  // --- Resume after backgrounding -----------------------------------------
  // When the tab returns to the foreground (unlock / re-focus), some mobile
  // browsers leave the element paused/stalled. We check `wantsToPlayRef` (the
  // user's intent) rather than `isPlaying` — the latter is flipped to false by
  // the element's own `pause` event when the browser suspends us in the
  // background, which would make this resume a no-op. Guarded so we never
  // fight an intentional pause.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const el = audioRef.current;
      if (el && wantsToPlayRef.current && el.paused) {
        el.play().catch(() => { /* may need a user gesture; ignore */ });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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
