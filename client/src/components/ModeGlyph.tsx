import type { GameMode } from "@shared/types";

export default function ModeGlyph({ mode }: { mode: GameMode }) {
  return (
    <svg className="mode-glyph" viewBox="0 0 64 64" aria-hidden>
      {mode === "classic" && (
        <>
          <circle cx="32" cy="32" r="26" fill="#5a117c" stroke="#fff" strokeWidth="4" />
          <circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
          <circle cx="32" cy="32" r="12" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
          <circle cx="32" cy="32" r="6" fill="#c6ff3d" />
        </>
      )}
      {mode === "buzzer" && (
        <>
          <circle cx="32" cy="32" r="26" fill="#ff4db8" stroke="#fff" strokeWidth="4" />
          <path
            fill="#c6ff3d"
            d="M35.5 12 21 33.5h11.2L27.2 52 45 30.2H33.4L35.5 12z"
          />
        </>
      )}
      {mode === "impostor" && (
        <>
          <rect x="6" y="18" width="52" height="28" rx="14" fill="#1a1028" stroke="#fff" strokeWidth="4" />
          <circle cx="24" cy="32" r="5" fill="#c6ff3d" />
          <circle cx="40" cy="32" r="5" fill="#c6ff3d" />
          <path d="M20 48h24" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {mode === "aux" && (
        <>
          <path d="M16 38a16 16 0 0 1 32 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <rect x="10" y="34" width="12" height="18" rx="6" fill="#c6ff3d" stroke="#fff" strokeWidth="3" />
          <rect x="42" y="34" width="12" height="18" rx="6" fill="#c6ff3d" stroke="#fff" strokeWidth="3" />
          <circle cx="32" cy="18" r="6" fill="#ff4db8" stroke="#fff" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
