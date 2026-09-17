import { useEffect, useMemo, useState } from "react";
import { searchTracks } from "../api";
import type { Track } from "@shared/types";

type Props = {
  onPick: (track: Track) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function TrackSearch({ onPick, placeholder, disabled }: Props) {
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const term = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    if (term.length < 2) {
      setTracks([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      setError("");
      searchTracks(term)
        .then((r) => setTracks(r.tracks))
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(t);
  }, [term]);

  return (
    <div>
      <div className="field">
        <label>Search iTunes</label>
        <input
          value={q}
          disabled={disabled}
          placeholder={placeholder || "Song or artist"}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading && <p className="hint">Searching catalogue…</p>}
      {error && <p className="error">{error}</p>}
      <div className="search-list">
        {tracks.map((track) => (
          <button
            key={track.trackId}
            type="button"
            className="search-item"
            disabled={disabled}
            onClick={() => {
              onPick(track);
              setQ("");
              setTracks([]);
            }}
          >
            <img src={track.artworkUrl} alt="" />
            <span>
              <strong>{track.title}</strong>
              <div className="hint" style={{ margin: 0 }}>
                {track.artist}
              </div>
            </span>
            <span className="pill">Add</span>
          </button>
        ))}
      </div>
    </div>
  );
}
