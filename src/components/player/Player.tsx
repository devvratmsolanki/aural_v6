import { usePlayer } from "@/contexts/PlayerContext";
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Heart, Volume2, VolumeX, Mic2, StickyNote, MessageCircleHeart } from "lucide-react";
import { coverUrl } from "@/lib/storage";
import { Slider } from "@/components/ui/slider";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SongExtras } from "@/components/music/SongExtras";
import logo from "@/assets/logo.png";

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

const useSwipeDownClose = (onClose: () => void) => {
  const startY = useRef<number | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; },
    onTouchMove: (e: React.TouchEvent) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 90) { startY.current = null; onClose(); }
    },
    onTouchEnd: () => { startY.current = null; },
  };
};

export const Player = () => {
  const { current, isPlaying, position, duration, volume, shuffle, loop, toggle, next, prev, seek, setVolume, toggleShuffle, toggleLoop } = usePlayer();
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extrasTab, setExtrasTab] = useState<"lyrics" | "voice" | "letters">("lyrics");
  const [fullOpen, setFullOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.8);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const swipeExtras = useSwipeDownClose(() => setExtrasOpen(false));
  const swipeFull = useSwipeDownClose(() => setFullOpen(false));

  const timed = (current?.timed_lyrics ?? null) as { time: number; text: string }[] | null;

  const activeIdx = useMemo(() => {
    if (!timed || timed.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < timed.length; i++) {
      if (position + 0.15 >= timed[i].time) idx = i; else break;
    }
    return idx;
  }, [timed, position]);

  useEffect(() => {
    if (!extrasOpen || extrasTab !== "lyrics" || activeIdx < 0) return;
    const el = lineRefs.current[activeIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx, extrasOpen, extrasTab]);

  useEffect(() => {
    if (!current || !user) { setLiked(false); return; }
    supabase.from("favorites").select("id").eq("user_id", user.id).eq("song_id", current.id).maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [current, user]);

  const toggleLike = async () => {
    if (!current || !user) return;
    if (liked) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("song_id", current.id);
      setLiked(false);
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, song_id: current.id });
      setLiked(true);
    }
  };

  const toggleMute = () => {
    if (volume > 0) { setLastVolume(volume); setVolume(0); }
    else { setVolume(lastVolume || 0.8); }
  };

  return (
    <footer className="h-24 md:h-24 bg-card border-t border-border flex items-center justify-between px-2 md:px-6 shrink-0 z-10 shadow-deck gap-2">
      <div className="flex items-center gap-2 md:gap-4 w-[38%] md:w-1/4 min-w-0">
        {current ? (
          <>
            <button onClick={() => setFullOpen(true)} className="size-12 md:size-14 shrink-0 bg-background rounded-sm overflow-hidden ring-1 ring-border hover:ring-primary transition-all" aria-label="Open now playing">
              {current.cover_image ? (
                <img src={coverUrl(current.cover_image)} alt={`${current.title} cover`} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-gradient-amber/40 flex items-center justify-center">
                  <img src={logo} alt="" className="w-2/3 h-2/3 object-contain opacity-90" />
                </div>
              )}
            </button>
            <button onClick={() => setFullOpen(true)} className="min-w-0 text-left">
              <div className="text-sm font-medium truncate">{current.title}</div>
              {current.artist && <div className="text-xs text-muted-foreground truncate">{current.artist}</div>}
            </button>
            <button onClick={toggleLike} className="ml-1 md:ml-2 shrink-0 text-muted-foreground hover:text-primary transition-colors" aria-label={liked ? "Unlike" : "Like"}>
              <Heart className={`h-4 w-4 ${liked ? "fill-primary text-primary" : ""}`} />
            </button>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Pick something to play</div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center flex-1 md:w-2/4 max-w-[600px]">
        <div className="flex items-center gap-4 md:gap-6 mb-1 md:mb-2">
          <button onClick={toggleShuffle} className={`hidden md:inline-flex transition-colors ${shuffle ? "text-primary" : "text-muted-foreground hover:text-silver"}`} aria-label="Shuffle"><Shuffle className="h-4 w-4" /></button>
          <button onClick={prev} className="text-silver hover:text-foreground" aria-label="Previous"><SkipBack className="h-5 w-5" /></button>
          <button onClick={toggle} className="text-primary hover:text-primary/80 hover:scale-105 transition-all drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]" aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 fill-current" />}
          </button>
          <button onClick={next} className="text-silver hover:text-foreground" aria-label="Next"><SkipForward className="h-5 w-5" /></button>
          <button onClick={toggleLoop} className={`hidden md:inline-flex transition-colors ${loop ? "text-primary" : "text-muted-foreground hover:text-silver"}`} aria-label="Loop"><Repeat className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-2 md:gap-3 w-full">
          <span className="text-[10px] text-muted-foreground tabular-nums w-9 md:w-10 text-right">{fmt(position)}</span>
          <Slider min={0} max={duration || 1} step={1} value={[Math.min(position, duration || 0)]} onValueChange={(v) => seek(v[0])} className="flex-1" />
          <span className="text-[10px] text-muted-foreground tabular-nums w-9 md:w-10">{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 md:gap-3 md:w-1/4">
        {current && (
          <Sheet open={extrasOpen} onOpenChange={setExtrasOpen}>
            <SheetTrigger asChild>
              <button onClick={() => setExtrasTab("lyrics")} className="text-muted-foreground hover:text-primary transition-colors p-1.5" aria-label="Lyrics">
                <Mic2 className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col" {...swipeExtras}>
              <div className="px-6 pt-6 pb-3 border-b border-border bg-background shrink-0">
                <SheetHeader>
                  <SheetTitle className="text-left pr-8">
                    {current.title}
                    {current.artist && <span className="block text-sm font-normal text-muted-foreground">{current.artist}</span>}
                  </SheetTitle>
                </SheetHeader>
              </div>
              <Tabs value={extrasTab} onValueChange={(v) => setExtrasTab(v as any)} className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid grid-cols-3 mx-6 mt-4 shrink-0">
                  <TabsTrigger value="lyrics"><Mic2 className="h-3.5 w-3.5 mr-1.5" /> Lyrics {timed && <span className="ml-1.5 text-[9px] text-primary">●</span>}</TabsTrigger>
                  <TabsTrigger value="voice"><MessageCircleHeart className="h-3.5 w-3.5 mr-1.5" /> Voice</TabsTrigger>
                  <TabsTrigger value="letters"><StickyNote className="h-3.5 w-3.5 mr-1.5" /> Letters</TabsTrigger>
                </TabsList>
                <TabsContent value="lyrics" className="flex-1 overflow-y-auto px-6 pb-8 mt-2">
                  {timed ? (
                    <div className="mt-4 space-y-3 pb-12">
                      {timed.map((line, i) => (
                        <div
                          key={i}
                          ref={(el) => (lineRefs.current[i] = el)}
                          onClick={() => seek(line.time)}
                          className={`cursor-pointer text-base leading-relaxed transition-all duration-300 ${
                            i === activeIdx
                              ? "text-primary font-semibold scale-[1.02]"
                              : i < activeIdx
                              ? "text-muted-foreground/50"
                              : "text-foreground/70"
                          }`}
                        >
                          {line.text}
                        </div>
                      ))}
                    </div>
                  ) : current.lyrics ? (
                    <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
                      {current.lyrics}
                    </pre>
                  ) : (
                    <p className="mt-6 text-sm text-muted-foreground italic">No lyrics for this song yet.</p>
                  )}
                </TabsContent>
                <TabsContent value="voice" className="flex-1 overflow-y-auto px-6 pb-8 mt-2">
                  <SongExtras songId={current.id} section="voice" listenSeconds={position} />
                </TabsContent>
                <TabsContent value="letters" className="flex-1 overflow-y-auto px-6 pb-8 mt-2">
                  <SongExtras songId={current.id} section="letters" listenSeconds={position} />
                </TabsContent>
              </Tabs>
            </SheetContent>
          </Sheet>
        )}
        <button onClick={toggleMute} className="hidden md:inline-flex text-muted-foreground hover:text-foreground transition-colors p-1" aria-label={volume === 0 ? "Unmute" : "Mute"}>
          {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <Slider min={0} max={1} step={0.01} value={[volume]} onValueChange={(v) => setVolume(v[0])} className="hidden md:block w-24" />
      </div>

      {current && (
        <Sheet open={fullOpen} onOpenChange={setFullOpen}>
          <SheetContent side="bottom" className="h-[100dvh] p-0 border-0 bg-gradient-velvet" {...swipeFull}>
            <div className="h-full flex flex-col items-center justify-between px-6 py-10 max-w-md mx-auto">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/40" aria-hidden />
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Now playing</div>
              </div>
              <div className="w-full max-w-sm aspect-square rounded-md overflow-hidden ring-1 ring-border shadow-glow">
                {current.cover_image ? (
                  <img src={coverUrl(current.cover_image)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-amber/40 flex items-center justify-center">
                    <img src={logo} alt="" className="w-1/2 h-1/2 object-contain opacity-90" />
                  </div>
                )}
              </div>
              <div className="text-center w-full">
                <div className="text-2xl font-display tracking-tight truncate">{current.title}</div>
                {current.artist && <div className="text-sm text-muted-foreground mt-1 truncate">{current.artist}</div>}
              </div>
              <div className="w-full">
                <Slider min={0} max={duration || 1} step={1} value={[Math.min(position, duration || 0)]} onValueChange={(v) => seek(v[0])} />
                <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground mt-1.5">
                  <span>{fmt(position)}</span><span>{fmt(duration)}</span>
                </div>
              </div>
              <div className="flex items-center gap-8">
                <button onClick={toggleShuffle} className={`transition-colors ${shuffle ? "text-primary" : "text-muted-foreground"}`} aria-label="Shuffle"><Shuffle className="h-5 w-5" /></button>
                <button onClick={prev} className="text-foreground" aria-label="Previous"><SkipBack className="h-7 w-7" /></button>
                <button onClick={toggle} className="size-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 transition-transform shadow-glow" aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 fill-current ml-0.5" />}
                </button>
                <button onClick={next} className="text-foreground" aria-label="Next"><SkipForward className="h-7 w-7" /></button>
                <button onClick={toggleLoop} className={`transition-colors ${loop ? "text-primary" : "text-muted-foreground"}`} aria-label="Loop"><Repeat className="h-5 w-5" /></button>
              </div>
              <div className="flex items-center gap-3 w-full">
                <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground" aria-label="Mute">
                  {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <Slider min={0} max={1} step={0.01} value={[volume]} onValueChange={(v) => setVolume(v[0])} className="flex-1" />
              </div>
              <div className="flex items-center gap-5 flex-wrap justify-center">
                <button onClick={() => { setFullOpen(false); setExtrasTab("lyrics"); setExtrasOpen(true); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><Mic2 className="h-4 w-4" /> Lyrics</button>
                <button onClick={() => { setFullOpen(false); setExtrasTab("voice"); setExtrasOpen(true); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><MessageCircleHeart className="h-4 w-4" /> Voice</button>
                <button onClick={() => { setFullOpen(false); setExtrasTab("letters"); setExtrasOpen(true); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><StickyNote className="h-4 w-4" /> Letters</button>
                <button onClick={toggleLike} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><Heart className={`h-4 w-4 ${liked ? "fill-primary text-primary" : ""}`} /> {liked ? "Liked" : "Like"}</button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </footer>
  );
};
