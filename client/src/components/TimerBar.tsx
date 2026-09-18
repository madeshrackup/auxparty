import { useEffect, useRef, useState } from "react";

export default function TimerBar({
  endsAt,
  duration,
  serverNow,
}: {
  endsAt: number | null;
  duration: number;
  serverNow: number;
}) {
  const origin = useRef<{ endsAt: number; remaining: number; perf: number } | null>(null);
  if (endsAt && (!origin.current || origin.current.endsAt !== endsAt)) {
    origin.current = {
      endsAt,
      remaining: Math.max(0, endsAt - serverNow),
      perf: performance.now(),
    };
  }
  if (!endsAt) origin.current = null;

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt || !origin.current || duration <= 0) return null;

  const remaining = Math.max(
    0,
    origin.current.remaining - (performance.now() - origin.current.perf),
  );
  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));
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
