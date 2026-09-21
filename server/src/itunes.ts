import type { BuzzerChartId, Track } from "../../shared/types.ts";

export type BuzzerItunesChartId = Exclude<BuzzerChartId, "custom">;

type ItunesSong = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
};

type RssEntry = {
  "im:name"?: { label?: string };
  "im:artist"?: { label?: string };
  "im:collection"?: { "im:name"?: { label?: string } };
  "im:image"?: { label?: string }[];
  id?: { attributes?: { "im:id"?: string } };
  link?: { attributes?: { rel?: string; href?: string; type?: string } }[];
};

const cache = new Map<string, { at: number; tracks: Track[] }>();
const TTL = 1000 * 60 * 10;

export const CHART_FEEDS: Record<BuzzerItunesChartId, string> = {
  top100: "https://itunes.apple.com/us/rss/topsongs/limit=100/json",
  pop: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=14/json",
  hiphop: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=18/json",
  rock: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=21/json",
  dance: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=17/json",
  alternative: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=20/json",
  rnb: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=15/json",
  country: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=6/json",
  latin: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=12/json",
  electronic: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=7/json",
  kpop: "https://itunes.apple.com/us/rss/topsongs/limit=100/genre=51/json",
};

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

function mapRssEntry(entry: RssEntry): Track | null {
  const trackId = Number(entry.id?.attributes?.["im:id"] || 0);
  const title = entry["im:name"]?.label || "";
  const artist = entry["im:artist"]?.label || "";
  const album = entry["im:collection"]?.["im:name"]?.label || "";
  const images = entry["im:image"] || [];
  const art = images[images.length - 1]?.label || "";
  const preview =
    (entry.link || []).find((link) => link.attributes?.rel === "enclosure")?.attributes?.href || "";
  if (!trackId || !title || !artist || !preview) return null;
  return {
    trackId,
    title,
    artist,
    album,
    artworkUrl: art.replace("170x170bb", "600x600bb").replace("170x170", "600x600"),
    previewUrl: preview,
  };
}

async function cached(key: string, load: () => Promise<Track[]>): Promise<Track[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.tracks;
  const tracks = await load();
  cache.set(key, { at: Date.now(), tracks });
  return tracks;
}

export async function searchItunes(term: string, limit = 25): Promise<Track[]> {
  const q = term.trim().slice(0, 80);
  if (q.length < 2) return [];
  return cached(`search:${q.toLowerCase()}::${limit}`, async () => {
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
    return (data.results || []).map(mapTrack).filter((t): t is Track => t !== null);
  });
}

export async function fetchChart(chart: BuzzerItunesChartId): Promise<Track[]> {
  const feed = CHART_FEEDS[chart];
  return cached(`chart:${chart}`, async () => {
    const res = await fetch(feed, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Could not load the ${chart} chart.`);
    }
    const data = (await res.json()) as { feed?: { entry?: RssEntry | RssEntry[] } };
    const entries = data.feed?.entry;
    const list = !entries ? [] : Array.isArray(entries) ? entries : [entries];
    return uniqueTracks(list.map(mapRssEntry).filter((t): t is Track => t !== null));
  });
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

const PLAYLIST_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type PlaylistSong = { title: string; artist: string };

export async function resolvePlaylist(url: string): Promise<{ label: string; tracks: Track[] }> {
  const raw = url.trim();
  if (!raw) throw new Error("Paste a Spotify or Apple Music playlist link.");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a playlist link.");
  }

  const host = parsed.hostname.replace(/^www\./, "");
  let songs: PlaylistSong[] = [];
  let label = "Playlist";

  if (host === "open.spotify.com" || host === "spotify.link") {
    const id = parsed.pathname.match(/playlist\/([A-Za-z0-9]+)/)?.[1];
    if (!id) throw new Error("That Spotify link isn't a playlist.");
    const resolved = await fetchPlaylistPage(`https://open.spotify.com/embed/playlist/${id}`);
    label = resolved.label || "Spotify playlist";
    songs = parseSpotifyPlaylist(resolved.html);
  } else if (host === "music.apple.com" || host === "itunes.apple.com") {
    const resolved = await fetchPlaylistPage(parsed.toString());
    label = resolved.label || "Apple Music playlist";
    songs = parseApplePlaylist(resolved.html);
  } else {
    throw new Error("Use a Spotify or Apple Music playlist link.");
  }

  if (songs.length === 0) {
    throw new Error("Couldn't read tracks from that playlist. Make sure it's public.");
  }

  const found = await Promise.all(
    songs.slice(0, 40).map(async (song) => {
      const q = `${song.title} ${song.artist}`.trim();
      const hits = await searchItunes(q, 5).catch(() => [] as Track[]);
      return (
        hits.find(
          (t) =>
            t.title.toLowerCase() === song.title.toLowerCase() ||
            t.artist.toLowerCase().includes(song.artist.toLowerCase()),
        ) || hits[0] || null
      );
    }),
  );

  const tracks = uniqueTracks(found.filter((t): t is Track => t !== null));
  if (tracks.length === 0) {
    throw new Error("Found the playlist, but none of those songs have iTunes previews.");
  }
  return { label, tracks };
}

async function fetchPlaylistPage(url: string): Promise<{ html: string; label: string }> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": PLAYLIST_UA,
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error("Could not open that playlist.");
  const html = await res.text();
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  const title = og?.[1] ? decodeHtml(og[1]) : "Playlist";
  return { html, label: title.replace(/\s+-\s+playlist by.*$/i, "").trim() || title };
}

function parseSpotifyPlaylist(html: string): PlaylistSong[] {
  const songs: PlaylistSong[] = [];
  const seen = new Set<string>();

  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData?.[1]) {
    try {
      const data = JSON.parse(nextData[1]) as {
        props?: { pageProps?: { state?: { data?: { entity?: { name?: string; trackList?: { title?: string; subtitle?: string }[] } } } } };
      };
      for (const track of data.props?.pageProps?.state?.data?.entity?.trackList || []) {
        pushSong(songs, seen, track.title, track.subtitle);
      }
    } catch {
      collectSongsFromUnknown(songs, seen, nextData[1]);
    }
  }

  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const block of jsonLd) {
    try {
      const data = JSON.parse(block[1] || "") as {
        name?: string;
        track?: { name?: string; byArtist?: { name?: string } | { name?: string }[] }[];
      };
      for (const track of data.track || []) {
        const artist = Array.isArray(track.byArtist) ? track.byArtist[0]?.name : track.byArtist?.name;
        pushSong(songs, seen, track.name, artist);
      }
    } catch {
      /* ignore */
    }
  }

  const entity = html.match(/Spotify\.Entity\s*=\s*(\{[\s\S]*?\});/);
  if (entity?.[1]) {
    collectSongsFromUnknown(songs, seen, entity[1]);
  }

  for (const match of html.matchAll(
    /"title"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"subtitle"\s*:\s*"((?:\\.|[^"\\])*)"/g,
  )) {
    pushSong(songs, seen, unescapeJson(match[1]), unescapeJson(match[2]));
  }

  return songs;
}

function parseApplePlaylist(html: string): PlaylistSong[] {
  const songs: PlaylistSong[] = [];
  const seen = new Set<string>();

  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const block of jsonLd) {
    try {
      const data = JSON.parse(block[1] || "") as {
        track?: { name?: string; byArtist?: { name?: string } | { name?: string }[] }[];
      };
      for (const track of data.track || []) {
        const artist = Array.isArray(track.byArtist) ? track.byArtist[0]?.name : track.byArtist?.name;
        pushSong(songs, seen, track.name, artist);
      }
    } catch {
      /* ignore */
    }
  }

  const serialized = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
  if (serialized?.[1]) {
    collectSongsFromUnknown(songs, seen, serialized[1]);
  }

  for (const match of html.matchAll(
    /"name"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"artistName"\s*:\s*"((?:\\.|[^"\\])*)"/g,
  )) {
    pushSong(songs, seen, unescapeJson(match[1]), unescapeJson(match[2]));
  }

  return songs;
}

function collectSongsFromUnknown(songs: PlaylistSong[], seen: Set<string>, raw: string) {
  try {
    walkSongs(JSON.parse(raw), songs, seen);
  } catch {
    /* ignore */
  }
}

function walkSongs(node: unknown, songs: PlaylistSong[], seen: Set<string>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkSongs(item, songs, seen);
    return;
  }
  const rec = node as Record<string, unknown>;
  const title = typeof rec.name === "string" ? rec.name : typeof rec.title === "string" ? rec.title : "";
  const artist =
    typeof rec.artistName === "string"
      ? rec.artistName
      : typeof rec.artist === "string"
        ? rec.artist
        : artistFromUnknown(rec.artists) || artistFromUnknown(rec.byArtist);
  if (title && artist && (rec.previewUrl || rec.durationMs || rec.durationInMillis || rec.trackNumber || rec.album || rec.uri || rec.artistName)) {
    pushSong(songs, seen, title, artist);
  }
  for (const value of Object.values(rec)) walkSongs(value, songs, seen);
}

function artistFromUnknown(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return artistFromUnknown(value[0]);
  if (typeof value === "object" && value && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

function pushSong(songs: PlaylistSong[], seen: Set<string>, title?: string, artist?: string) {
  const t = (title || "").replace(/\s+/g, " ").trim();
  const a = (artist || "").replace(/\s+/g, " ").trim();
  if (t.length < 1 || a.length < 1) return;
  if (/playlist|spotify|apple music|copyright/i.test(t) && t.length < 24) return;
  const key = `${t.toLowerCase()}::${a.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  songs.push({ title: t, artist: a });
}

function unescapeJson(value: string) {
  return value.replace(/\\"/g, '"').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
