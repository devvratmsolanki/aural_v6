export type Song = {
  id: string;
  title: string;
  artist: string;
  file_path: string;
  cover_image: string | null;
  lyrics: string | null;
  remarks?: string | null;
  play_from: number;
  end_at: number | null;
  tag_id: string | null;
  status: string;
  tag?: { id: string; name: string } | null;
  timed_lyrics?: { time: number; text: string }[] | null;
};

export type Tag = { id: string; name: string; remarks: string | null };

export type Playlist = { id: string; user_id: string; name: string; created_at: string };
