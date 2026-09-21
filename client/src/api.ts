import type { AuthUser } from "@shared/types";
import { API_URL } from "./config";

export class ApiError extends Error {
  code?: string;
  email?: string;
  constructor(message: string, code?: string, email?: string) {
    super(message);
    this.code = code;
    this.email = email;
  }
}

function readCsrfCookie() {
  if (typeof document === "undefined") return "";
  const prefix = "aux_csrf=";
  const hit = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  if (!hit) return "";
  try {
    return decodeURIComponent(hit.slice(prefix.length));
  } catch {
    return hit.slice(prefix.length);
  }
}

async function refreshCsrf() {
  await fetch(`${API_URL}/api/auth/csrf`, { credentials: "include" });
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return requestApi<T>(path, init, true);
}

async function requestApi<T>(path: string, init: RequestInit | undefined, retry: boolean): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCsrfCookie();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    email?: string;
  };
  if (retry && res.status === 403 && data.code === "csrf") {
    await refreshCsrf();
    return requestApi<T>(path, init, false);
  }
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, data.code, data.email);
  }
  return data;
}

export function getMe() {
  return api<{ user: AuthUser | null; playToken?: string | null }>("/api/auth/me");
}

export function register(
  username: string,
  email: string,
  password: string,
  consents: { acceptedTerms: boolean; ageConfirmed: boolean },
) {
  return api<{ pending: boolean; email: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password, ...consents }),
  });
}

export function checkUsername(username: string) {
  return api<{ available: boolean; errors: string[] }>(
    `/api/auth/username?username=${encodeURIComponent(username)}`,
  );
}

export function login(username: string, password: string) {
  return api<{ user: AuthUser; playToken?: string | null }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function verifyEmail(token: string) {
  return api<{ ok: boolean }>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function resendVerification(email: string) {
  return api<{ ok: boolean }>("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function logout() {
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function forgotPassword(email: string) {
  return api<{ ok: boolean }>("/api/auth/forgot", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string) {
  return api<{ ok: boolean }>("/api/auth/reset", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export function saveProfile(aboutMe: string) {
  return api<{ user: AuthUser; playToken?: string | null }>("/api/auth/profile", {
    method: "POST",
    body: JSON.stringify({ aboutMe }),
  });
}

export function saveAvatar(image: string, mime: string) {
  return api<{ user: AuthUser; playToken?: string | null }>("/api/auth/avatar", {
    method: "POST",
    body: JSON.stringify({ image, mime }),
  });
}

export function getAchievements() {
  return api<import("@shared/types").AchievementsState>("/api/auth/achievements");
}

export function getStats() {
  return api<import("@shared/types").PlayerStats>("/api/auth/stats");
}

export function startPasswordChange(oldPassword: string, newPassword: string) {
  return api<{ challengeId: string }>("/api/auth/password-start", {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

export function confirmPasswordChange(challengeId: string, code: string) {
  return api<{ ok: boolean }>("/api/auth/password-confirm", {
    method: "POST",
    body: JSON.stringify({ challengeId, code }),
  });
}

export function deleteAccount(password: string) {
  return api<{ ok: boolean }>("/api/auth/delete", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function searchTracks(q: string) {
  return api<{ tracks: import("@shared/types").Track[] }>(
    `/api/music/search?q=${encodeURIComponent(q)}`,
  );
}
