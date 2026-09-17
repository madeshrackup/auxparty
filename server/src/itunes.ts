import type { Track } from "../../shared/types.ts";

type ItunesSong = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
};

const cache = new Map<string, { at: number; tracks: Track[] }>();
const TTL = 1000 * 60 * 10;

function mapTrack(row: ItunesSong): Track | null {
  if (!row.trackId || !row.trackName || !row.artistName || !row.previewUrl) {
    return null;
  }
  const art = row.artworkUrl100 || "";
  return {
    trackId: row.trackId,
    title: row.trackName,
    artist: row.artistName,
    album: row.collectionName || "",
    artworkUrl: art.replace("100x100bb", "600x600bb").replace("100x100", "600x600"),
    previewUrl: row.previewUrl,
  };
}

export async function searchItunes(term: string, limit = 25): Promise<Track[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const key = `${q.toLowerCase()}::${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.tracks;

  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", q);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`iTunes search failed (${res.status})`);
  }
  const data = (await res.json()) as { results?: ItunesSong[] };
  const tracks = (data.results || [])
    .map(mapTrack)
    .filter((t): t is Track => t !== null);

  cache.set(key, { at: Date.now(), tracks });
  return tracks;
}

export function uniqueTracks(tracks: Track[]): Track[] {
  const seen = new Set<number>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (seen.has(t.trackId)) continue;
    seen.add(t.trackId);
    out.push(t);
  }
  return out;
}
