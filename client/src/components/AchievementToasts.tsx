import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ACHIEVEMENTS, type AchievementId, type AchievementUnlockedPayload } from "@shared/types";
import { playAchievement } from "../audio";
import { getSocket } from "../socket";
import { transitionNavigate } from "../transition";
import { useAuth } from "../useAuth";
import TrophyBadge from "./TrophyBadge";

const HOLD_MS = 5200;
const OUT_MS = 320;
const PENDING_KEY = "aux_pending_achievements";

type ToastItem = AchievementUnlockedPayload & { key: number };

const listeners = new Set<(payload: AchievementUnlockedPayload) => void>();

export function notifyAchievement(payload: AchievementUnlockedPayload) {
  for (const listener of listeners) listener(payload);
}

export function queuePendingAchievement(id: AchievementId, username: string) {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const prev = raw ? (JSON.parse(raw) as { username?: string; ids?: string[] }) : {};
    const same = String(prev.username || "").toLowerCase() === username.trim().toLowerCase();
    const ids = same && Array.isArray(prev.ids) ? prev.ids : [];
    if (!ids.includes(id)) ids.push(id);
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ username: username.trim(), ids }));
  } catch {
    /* ignore quota */
  }
}

function takePendingAchievements(username: string): AchievementUnlockedPayload[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const prev = JSON.parse(raw) as { username?: string; ids?: string[] };
    if (String(prev.username || "").toLowerCase() !== username.trim().toLowerCase()) return [];
    window.localStorage.removeItem(PENDING_KEY);
    const ids = Array.isArray(prev.ids) ? prev.ids : [];
    return ids
      .map((id) => ACHIEVEMENTS.find((item) => item.id === id))
      .filter((item): item is (typeof ACHIEVEMENTS)[number] => Boolean(item))
      .map((item) => ({ id: item.id, name: item.name, description: item.description }));
  } catch {
    return [];
  }
}

function isPayload(value: unknown): value is AchievementUnlockedPayload {
  if (!value || typeof value !== "object") return false;
  const row = value as AchievementUnlockedPayload;
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.description === "string";
}

export default function AchievementToasts() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const [leaving, setLeaving] = useState(false);
  const queueRef = useRef<AchievementUnlockedPayload[]>([]);
  const busyRef = useRef(false);
  const seenRef = useRef(new Set<AchievementId>());
  const seqRef = useRef(0);
  const enqueueRef = useRef<(payload: AchievementUnlockedPayload) => void>(() => undefined);

  enqueueRef.current = (payload: AchievementUnlockedPayload) => {
    if (seenRef.current.has(payload.id)) return;
    seenRef.current.add(payload.id);
    queueRef.current.push(payload);
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    busyRef.current = true;
    setLeaving(false);
    seqRef.current += 1;
    setCurrent({ ...next, key: seqRef.current });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) playAchievement();
  };

  useEffect(() => {
    const onUnlock = (payload: AchievementUnlockedPayload) => enqueueRef.current(payload);
    listeners.add(onUnlock);
    return () => {
      listeners.delete(onUnlock);
    };
  }, []);

  useEffect(() => {
    if (!auth.ready || !auth.user) {
      seenRef.current.clear();
      queueRef.current = [];
      busyRef.current = false;
      setCurrent(null);
      return;
    }
    for (const payload of takePendingAchievements(auth.user.username)) enqueueRef.current(payload);
    const sock = getSocket(auth.user.username, false, auth.user.avatarUrl, auth.playToken);
    const onSocket = (payload: unknown) => {
      if (isPayload(payload)) enqueueRef.current(payload);
    };
    sock.on("achievement:unlocked", onSocket);
    return () => {
      sock.off("achievement:unlocked", onSocket);
    };
  }, [auth.ready, auth.user, auth.playToken]);

  useEffect(() => {
    if (!current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const done = window.setTimeout(
      () => {
        setCurrent(null);
        setLeaving(false);
        busyRef.current = false;
        const next = queueRef.current.shift();
        if (!next) return;
        busyRef.current = true;
        seqRef.current += 1;
        setCurrent({ ...next, key: seqRef.current });
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) playAchievement();
      },
      HOLD_MS + (reduced ? 0 : OUT_MS),
    );
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(done);
    };
  }, [current]);

  if (!current) return null;

  return (
    <div className="achieve-toasts" aria-live="polite" aria-atomic="true">
      <button
        key={current.key}
        type="button"
        className={`achieve-toast ${leaving ? "out" : ""}`}
        onClick={() => transitionNavigate(navigate, "/achievements")}
      >
        <TrophyBadge id={current.id} name={current.name} unlocked selected decorative size={58} />
        <span className="achieve-toast-copy">
          <span className="achieve-toast-kicker">Achievement unlocked</span>
          <span className="achieve-toast-name">{current.name}</span>
          <span className="achieve-toast-desc">{current.description}</span>
        </span>
      </button>
    </div>
  );
}
