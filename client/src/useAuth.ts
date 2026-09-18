import { useEffect, useState } from "react";
import {
  getMe,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  resendVerification as resendApi,
  verifyEmail as verifyApi,
} from "./api";
import { getGuestName, setGuestName as persistGuest } from "./identity";
import { resetSocket } from "./socket";
import type { AuthUser } from "@shared/types";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guestName, setGuest] = useState(getGuestName);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const displayName = user?.username || guestName;

  return {
    user,
    guestName,
    displayName,
    ready,
    error,
    setError,
    setUser,
    setGuestName: (name: string) => {
      persistGuest(name);
      setGuest(name);
    },
    async register(username: string, email: string, password: string) {
      const r = await registerApi(username, email, password);
      resetSocket();
      setError("");
      return r;
    },
    async login(username: string, password: string) {
      const r = await loginApi(username, password);
      resetSocket();
      setUser(r.user);
      setError("");
      return r.user;
    },
    async verifyEmail(token: string) {
      const r = await verifyApi(token);
      resetSocket();
      setUser(r.user);
      setError("");
      return r.user;
    },
    async resendVerification(email: string) {
      await resendApi(email);
    },
    async logout() {
      await logoutApi();
      resetSocket();
      setUser(null);
    },
  };
}

export type AuthState = ReturnType<typeof useAuth>;
