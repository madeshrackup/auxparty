import { useEffect, useState } from "react";

export default function TimerBar({
  startedAt,
  duration,
  serverNow,
  showSeconds,
}: {
  startedAt: number | null;
  duration: number;
  serverNow: number;
  showSeconds?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  if (!startedAt) return null;
  const offset = Date.now() - serverNow;
  const elapsed = Math.max(0, now + offset - startedAt);
  const remaining = Math.max(0, duration - elapsed);
  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));
  const secs = Math.max(0, Math.ceil(remaining / 1000));
  return (
    <div className="timer-wrap">
      <div className="timer">
        <span style={{ width: `${pct}%` }} />
      </div>
      {showSeconds && <div className="timer-secs">{secs}</div>}
    </div>
  );
}
