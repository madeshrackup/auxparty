import type { AuthUser } from "@shared/types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function getMe() {
  return api<{ user: AuthUser | null }>("/api/auth/me");
}

export function register(username: string, email: string, password: string) {
  return api<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export function login(username: string, password: string) {
  return api<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function searchTracks(q: string) {
  return api<{ tracks: import("@shared/types").Track[] }>(
    `/api/music/search?q=${encodeURIComponent(q)}`,
  );
}
