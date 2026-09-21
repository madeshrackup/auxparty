import { timingSafeEqual } from "node:crypto";
import type { Track } from "../../shared/types.ts";
import { APP_URL, IS_PROD } from "./env.ts";

const LOCAL_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const MEDIA_HOST_SUFFIXES = [".apple.com", ".mzstatic.com", ".itunes.com"];
const AVATAR_IDS = new Set(["disco", "bass", "vinyl", "mic", "wave", "aux"]);

type HeaderBag = Record<string, string | string[] | undefined>;

export type GuardRequest = {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers: HeaderBag;
  cookies?: Record<string, string | undefined>;
};

const buckets = new Map<string, { count: number; reset: number }>();
let lastSweep = 0;

function header(req: GuardRequest, name: string): string {
  const headers = req.headers || {};
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || "");
  return String(raw || "");
}

function originFromHost(host?: string) {
  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

function withWwwOrigins(origin: string): string[] {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const alt = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    return [origin, `${url.protocol}//${alt}`.replace(/\/$/, "")];
  } catch {
    return [origin];
  }
}

export function isSocketPath(req: { originalUrl?: string; url?: string }): boolean {
  const path = String(req.originalUrl || req.url || "").split("?")[0];
  return path === "/socket.io" || path.startsWith("/socket.io/");
}

export function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN || APP_URL || "http://localhost:5173";
  const list = raw
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter((item) => item && item !== "*" && !item.includes("*"));
  for (const extra of [APP_URL, originFromHost(process.env.VERCEL_URL)]) {
    if (!extra || extra === "*") continue;
    for (const origin of withWwwOrigins(extra)) {
      if (!list.includes(origin)) list.push(origin);
    }
  }
  if (!IS_PROD) {
    for (const local of LOCAL_ORIGINS) {
      if (!list.includes(local)) list.push(local);
    }
  }
  return list.length ? list : IS_PROD ? [] : [...LOCAL_ORIGINS];
}

export function corsOriginOption(): true | string[] | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  const allow = allowedOrigins();
  return (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    cb(null, allow.includes(origin.replace(/\/$/, "")));
  };
}

export function isAllowedOrigin(origin: string): boolean {
  try {
    return allowedOrigins().includes(new URL(origin).origin);
  } catch {
    return allowedOrigins().includes(origin.replace(/\/$/, ""));
  }
}

export function clientIp(req: GuardRequest): string {
  const forwarded = header(req, "x-forwarded-for").split(",")[0]?.trim();
  return forwarded || header(req, "x-real-ip") || "local";
}

export function sanitizeText(value: string, max: number, multiline = false): string {
  let cleaned = value.replace(/\0/g, "");
  if (multiline) {
    cleaned = cleaned
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  } else {
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ");
  }
  return cleaned.trim().slice(0, max);
}

export function sanitizeName(value: string): string {
  return sanitizeText(value, 20) || "Guest";
}

export function sanitizeAvatar(value: unknown): string {
  const raw = String(value || "");
  return AVATAR_IDS.has(raw) ? raw : "disco";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function assertUuid(value: unknown, label = "id"): string {
  const id = String(value || "").trim();
  if (!isUuid(id)) throw new Error(`That ${label} is not valid.`);
  return id;
}

export function guestPlayerId(raw: unknown): string {
  const id = String(raw || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  return `g:${id || crypto.randomUUID()}`;
}

function hostAllowed(hostname: string, suffixes: string[]): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return suffixes.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

export function safeHttpsUrl(value: string, suffixes = MEDIA_HOST_SUFFIXES): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!hostAllowed(url.hostname, suffixes)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const trackId = Number(row.trackId);
  if (!Number.isFinite(trackId) || trackId <= 0 || trackId > 1e15) return null;
  const title = sanitizeText(String(row.title || ""), 120);
  const artist = sanitizeText(String(row.artist || ""), 120);
  const album = sanitizeText(String(row.album || ""), 120);
  const artworkUrl = safeHttpsUrl(String(row.artworkUrl || ""));
  const previewUrl = safeHttpsUrl(String(row.previewUrl || ""));
  if (!title || !artist || !artworkUrl || !previewUrl) return null;
  return { trackId, title, artist, album, artworkUrl, previewUrl };
}

export function sniffImageMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function pathOf(req: GuardRequest): string {
  return String(req.originalUrl || req.url || "").split("?")[0];
}

export function applySecurityHeaders(res: { setHeader: (name: string, value: string) => unknown }): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  if (IS_PROD) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function cookieValue(req: GuardRequest, name: string): string {
  const fromBag = req.cookies?.[name];
  if (typeof fromBag === "string" && fromBag) return fromBag;
  const raw = header(req, "cookie");
  const prefix = `${name}=`;
  const hit = raw.split(/;\s*/).find((part) => part.startsWith(prefix));
  if (!hit) return "";
  try {
    return decodeURIComponent(hit.slice(prefix.length));
  } catch {
    return hit.slice(prefix.length);
  }
}

function tokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function csrfAllowed(req: GuardRequest): boolean {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = header(req, "origin");
  if (origin) return isAllowedOrigin(origin);
  const referer = header(req, "referer");
  if (referer) {
    try {
      return isAllowedOrigin(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  const site = header(req, "sec-fetch-site").toLowerCase();
  if (site === "same-origin" || site === "none") return true;
  return !IS_PROD;
}

export function csrfTokenAllowed(req: GuardRequest): boolean {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const cookie = cookieValue(req, "aux_csrf");
  const token = header(req, "x-csrf-token");
  return tokensMatch(cookie, token);
}

function takeToken(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [id, bucket] of buckets) {
      if (now >= bucket.reset) buckets.delete(id);
    }
  }
  const hit = buckets.get(key);
  if (!hit || now >= hit.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (hit.count >= limit) return false;
  hit.count += 1;
  return true;
}

export function allowRequest(req: GuardRequest): boolean {
  const path = pathOf(req);
  const method = (req.method || "GET").toUpperCase();
  const ip = clientIp(req);
  if (path.includes("/api/auth/login") || path.includes("/api/auth/register")) {
    return takeToken(`auth:${ip}`, 12, 15 * 60_000);
  }
  if (path.includes("/api/auth/forgot") || path.includes("/api/auth/resend-verification")) {
    return takeToken(`mail:${ip}`, 4, 15 * 60_000);
  }
  if (
    path.includes("/api/auth/reset") ||
    path.includes("/api/auth/password-start") ||
    path.includes("/api/auth/password-confirm")
  ) {
    return takeToken(`secret:${ip}`, 10, 15 * 60_000);
  }
  if (path.includes("/api/auth/username")) {
    return takeToken(`user:${ip}`, 40, 60_000);
  }
  if (path.includes("/api/auth/avatar")) {
    return takeToken(`avatar:${ip}`, 8, 15 * 60_000);
  }
  if (path.includes("/api/music/search")) {
    return takeToken(`search:${ip}`, 40, 60_000);
  }
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    return takeToken(`write:${ip}`, 80, 60_000);
  }
  return takeToken(`get:${ip}`, 240, 60_000);
}

export function publicError(err: unknown, fallback: string): string {
  if (!IS_PROD && err instanceof Error && err.message) return err.message;
  return fallback;
}
