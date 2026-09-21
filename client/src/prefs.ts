import { MAX_ROUNDS, MIN_ROUNDS } from "@shared/types";

export const PREFS_COOKIE = "aux_prefs";
const PREFS_STORAGE = "aux_prefs";
const YEAR_S = 60 * 60 * 24 * 365;

export type GamePrefs = {
  volume: number;
  privateLobby: boolean;
  rounds: number;
};

export const DEFAULT_PREFS: GamePrefs = {
  volume: 80,
  privateLobby: true,
  rounds: 5,
};

function clampPrefs(raw: Partial<GamePrefs> | null | undefined): GamePrefs {
  const volume = Math.round(Number(raw?.volume));
  const rounds = Math.round(Number(raw?.rounds));
  return {
    volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : DEFAULT_PREFS.volume,
    privateLobby: raw?.privateLobby !== false,
    rounds: Number.isFinite(rounds)
      ? Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, rounds))
      : DEFAULT_PREFS.rounds,
  };
}

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const hit = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  if (!hit) return "";
  try {
    return decodeURIComponent(hit.slice(prefix.length));
  } catch {
    return hit.slice(prefix.length);
  }
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR_S}; SameSite=Lax${secure}`;
}

function parsePrefs(raw: string): GamePrefs | null {
  if (!raw) return null;
  try {
    return clampPrefs(JSON.parse(raw) as Partial<GamePrefs>);
  } catch {
    return null;
  }
}

export function loadPrefs(): GamePrefs {
  const fromCookie = parsePrefs(readCookie(PREFS_COOKIE));
  if (fromCookie) return fromCookie;
  try {
    return parsePrefs(localStorage.getItem(PREFS_STORAGE) || "") || { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(patch: Partial<GamePrefs>): GamePrefs {
  const next = clampPrefs({ ...loadPrefs(), ...patch });
  const encoded = JSON.stringify(next);
  writeCookie(PREFS_COOKIE, encoded);
  try {
    localStorage.setItem(PREFS_STORAGE, encoded);
  } catch {
    /* private mode */
  }
  return next;
}
