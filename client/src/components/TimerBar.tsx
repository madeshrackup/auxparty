import { useEffect, useState } from "react";

export default function TimerBar({
  endsAt,
  duration,
}: {
  endsAt: number | null;
  duration: number;
  serverNow?: number;
}) {
  const totalMs = Math.max(0, duration);
  const [remaining, setRemaining] = useState(totalMs);

  useEffect(() => {
    if (!endsAt || totalMs <= 0) {
      setRemaining(0);
      return;
    }
    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      setRemaining(Math.max(0, totalMs - elapsed));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt, totalMs]);

  if (!endsAt || totalMs <= 0) return null;

  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
  const secs = Math.max(0, Math.ceil(remaining / 1000));
  const urgent = remaining > 0 && remaining <= 5000;

  return (
    <div className={`timer-wrap ${urgent ? "urgent" : ""}`}>
      <div className="timer">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="timer-secs">{secs}</div>
    </div>
  );
}
