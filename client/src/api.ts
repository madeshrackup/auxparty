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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    email?: string;
  };
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, data.code, data.email);
  }
  return data;
}

export function getMe() {
  return api<{ user: AuthUser | null }>("/api/auth/me");
}

export function register(username: string, email: string, password: string) {
  return api<{ pending: boolean; email: string }>("/api/auth/register", {
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

export function verifyEmail(token: string) {
  return api<{ user: AuthUser }>("/api/auth/verify", {
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

export function searchTracks(q: string) {
  return api<{ tracks: import("@shared/types").Track[] }>(
    `/api/music/search?q=${encodeURIComponent(q)}`,
  );
}
