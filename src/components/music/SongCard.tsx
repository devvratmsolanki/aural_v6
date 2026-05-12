import { Play, Heart } from "lucide-react";
import { coverUrl, resolveAudioUrl } from "@/lib/storage";
import { usePlayer } from "@/contexts/PlayerContext";
import type { Song } from "@/types/music";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";

interface Props { song: Song; queue?: Song[]; size?: "sm" | "lg" }

const Cover = ({ src, alt, className }: { src: string | null; alt: string; className?: string }) => (
  src ? (
    <img src={coverUrl(src)} alt={alt} loading="lazy" className={className ?? "w-full h-full object-cover"} />
  ) : (
    <div className={`${className ?? "w-full h-full"} bg-gradient-amber/40 flex items-center justify-center`}>
      <img src={logo} alt="" className="w-2/3 h-2/3 object-contain opacity-90" />
    </div>
  )
);

export const LikeButton = ({ songId, className = "" }: { songId: string; className?: string }) => {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase.from("favorites").select("id").eq("user_id", user.id).eq("song_id", songId).maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [songId, user]);
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (!user) return;
    if (liked) { await supabase.from("favorites").delete().eq("user_id", user.id).eq("song_id", songId); setLiked(false); }
    else { await supabase.from("favorites").insert({ user_id: user.id, song_id: songId }); setLiked(true); }
  };
  return (
    <button onClick={toggle} aria-label={liked ? "Unlike" : "Like"} className={`p-2 rounded-full text-muted-foreground hover:text-primary transition-colors ${className}`}>
      <Heart className={`h-4 w-4 ${liked ? "fill-primary text-primary" : ""}`} />
    </button>
  );
};

const fmtTime = (s: number) => {
  if (!isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

const SongDuration = ({ song }: { song: Song }) => {
  const [dur, setDur] = useState<number>(() => {
    if (song.end_at && song.end_at > song.play_from) return song.end_at - song.play_from;
    return 0;
  });
  useEffect(() => {
    if (dur > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const url = await resolveAudioUrl(song);
        const a = new Audio();
        a.preload = "metadata";
        a.src = url;
        a.onloadedmetadata = () => {
          if (cancelled) return;
          const total = a.duration;
          const eff = (song.end_at ?? total) - (song.play_from ?? 0);
          setDur(Math.max(0, eff));
        };
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [song.id]);
  if (!dur) return null;
  return <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{fmtTime(dur)}</span>;
};

export const SongCard = ({ song, queue, size = "lg" }: Props) => {
  const { playSong } = usePlayer();
  const w = size === "lg" ? "w-full" : "w-44";
  return (
    <div className={`group ${w} animate-fade-in relative`}>
      <button
        onClick={() => playSong(song, queue)}
        className="w-full text-left"
        aria-label={`Play ${song.title} by ${song.artist}`}
      >
        <div className="bg-popover aspect-square rounded-sm mb-3 relative overflow-hidden ring-1 ring-border">
          <Cover src={song.cover_image} alt={`${song.title} cover`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Play className="h-10 w-10 text-primary fill-primary" />
          </div>
        </div>
        <div className="text-sm font-medium truncate">{song.title}</div>
        {song.artist && <div className="text-xs text-muted-foreground truncate">{song.artist}</div>}
      </button>
      <LikeButton songId={song.id} className="absolute top-2 right-2 bg-background/70 backdrop-blur opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" />
    </div>
  );
};

export const SongRow = ({ song, queue }: Props) => {
  const { playSong } = usePlayer();
  return (
    <div
      onClick={() => playSong(song, queue)}
      className="w-full flex items-center gap-3 md:gap-4 bg-popover/40 hover:bg-popover border border-transparent hover:border-border p-3 rounded-sm transition-all group cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playSong(song, queue); } }}
    >
      <div className="size-12 shrink-0 bg-background rounded-sm overflow-hidden ring-1 ring-border">
        <Cover src={song.cover_image} alt="" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{song.title}</div>
        {song.artist && <div className="text-xs text-muted-foreground truncate">{song.artist}</div>}
      </div>
      {song.tag?.name && <span className="text-[10px] uppercase tracking-widest text-muted-foreground bg-popover px-2 py-0.5 rounded-full border border-border">{song.tag.name}</span>}
      <SongDuration song={song} />
      <LikeButton songId={song.id} />
    </div>
  );
};

// Polaroid-style card (default home grid). Slight random tilt, white frame, caption underneath the photo.
export const PolaroidCard = ({ song, queue, index = 0 }: Props & { index?: number }) => {
  const { playSong } = usePlayer();
  const tilts = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0"];
  const tilt = tilts[index % tilts.length];
  return (
    <div className={`group relative ${tilt} hover:rotate-0 hover:-translate-y-1 transition-transform duration-300 animate-fade-in`}>
      <button
        onClick={() => playSong(song, queue)}
        className="block w-full text-left bg-[hsl(35_30%_94%)] p-3 pb-10 rounded-[2px] shadow-[0_10px_30px_-12px_hsl(0_0%_0%/0.6)]"
        aria-label={`Play ${song.title}`}
      >
        <div className="aspect-square overflow-hidden bg-[hsl(345_30%_55%)]">
          <Cover src={song.cover_image} alt={song.title} className="w-full h-full object-cover" />
        </div>
        <div className="absolute bottom-3 left-0 right-0 px-4 text-center">
          <div className="text-[13px] font-medium text-[hsl(325_40%_15%)] truncate font-display">{song.title}</div>
        </div>
      </button>
      <LikeButton songId={song.id} className="absolute top-2 right-2 bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" />
    </div>
  );
};
