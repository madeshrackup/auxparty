import type { AvatarId } from "../identity";

const PALETTE: Record<AvatarId, { skin: string; accent: string; ear: string }> = {
  disco: { skin: "#c84dff", accent: "#ffe14a", ear: "#9a2ad4" },
  bass: { skin: "#3ee0ff", accent: "#ff5d9a", ear: "#1aa8c4" },
  vinyl: { skin: "#7cff4a", accent: "#ff7a18", ear: "#4cb81f" },
  mic: { skin: "#ff8ad4", accent: "#7cffea", ear: "#e05aa8" },
  wave: { skin: "#ffd24a", accent: "#7a4dff", ear: "#e0a81a" },
  aux: { skin: "#ff5d7a", accent: "#b6ff3b", ear: "#d13a58" },
};

export default function Avatar({
  id,
  size = 160,
}: {
  id?: string;
  size?: number;
}) {
  const key = (id && id in PALETTE ? id : "disco") as AvatarId;
  const c = PALETTE[key];
  return (
    <svg
      className="avatar-svg"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
    >
      <circle cx="60" cy="64" r="40" fill={c.skin} />
      <ellipse cx="28" cy="52" rx="12" ry="16" fill={c.ear} />
      <ellipse cx="92" cy="52" rx="12" ry="16" fill={c.ear} />
      <circle cx="60" cy="64" r="40" fill={c.skin} />
      <rect x="18" y="38" width="84" height="14" rx="7" fill="#1a1028" />
      <circle cx="18" cy="45" r="10" fill="#1a1028" />
      <circle cx="102" cy="45" r="10" fill="#1a1028" />
      <circle cx="18" cy="45" r="6" fill={c.accent} />
      <circle cx="102" cy="45" r="6" fill={c.accent} />
      <circle cx="46" cy="66" r="7" fill="#1a1028" />
      <circle cx="74" cy="66" r="7" fill="#1a1028" />
      <circle cx="48" cy="64" r="2.4" fill="#fff" />
      <circle cx="76" cy="64" r="2.4" fill="#fff" />
      <path
        d="M48 82c6 8 18 8 24 0"
        fill="none"
        stroke="#1a1028"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="84" cy="78" r="6" fill={c.accent} />
    </svg>
  );
}
