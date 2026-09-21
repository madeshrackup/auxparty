import type { AchievementId } from "@shared/types";

const POINTS = Array.from({ length: 11 }, (_, i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 11;
  return `${(50 + 45 * Math.cos(angle)).toFixed(2)},${(50 + 45 * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

export default function TrophyBadge({
  id,
  name,
  unlocked,
  selected = false,
  size = 86,
  decorative = false,
  onClick,
}: {
  id: AchievementId;
  name: string;
  unlocked: boolean;
  selected?: boolean;
  size?: number;
  decorative?: boolean;
  onClick?: () => void;
}) {
  const gradId = `trophy-rim-${id}-${size}-${selected ? "on" : "off"}-${decorative ? "fx" : "ui"}`;
  const rim = selected ? `url(#${gradId})` : unlocked ? `url(#${gradId})` : "#5c4768";
  const face = unlocked || selected ? "#3a0d88" : "#1a082c";
  const start = selected ? "#e8ff8a" : "#ffe98a";
  const end = selected ? "#7aa80a" : "#9a6b00";
  const mark = (
    <>
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={start} />
            <stop offset="100%" stopColor={end} />
          </linearGradient>
        </defs>
        <polygon points={POINTS} fill={rim} />
        <polygon points={POINTS} fill={face} transform="translate(50 50) scale(0.78) translate(-50 -50)" />
      </svg>
      <span className="brand-mark trophy-logo" aria-hidden />
    </>
  );
  if (decorative) {
    return (
      <span className="trophy-badge unlocked selected static" style={{ width: size, height: size }} data-id={id} aria-hidden>
        {mark}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`trophy-badge ${unlocked ? "unlocked" : "locked"} ${selected ? "selected" : ""}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={name}
      aria-pressed={selected}
      data-id={id}
    >
      {mark}
    </button>
  );
}
