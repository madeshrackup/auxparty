import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  confirmPasswordChange as confirmPasswordApi,
  getMe,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  resendVerification as resendApi,
  saveAvatar as saveAvatarApi,
  saveProfile as saveProfileApi,
  startPasswordChange as startPasswordApi,
  deleteAccount as deleteAccountApi,
} from "./api";
import { getGuestName, setGuestName as persistGuest } from "./identity";
import { resetSocket } from "./socket";
import { queuePendingAchievement } from "./components/AchievementToasts";
import type { AuthUser } from "@shared/types";

type AuthState = {
  user: AuthUser | null;
  playToken: string | null;
  guestName: string;
  displayName: string;
  ready: boolean;
  error: string;
  setError: (message: string) => void;
  setUser: (user: AuthUser | null) => void;
  setGuestName: (name: string) => void;
  register: (
    username: string,
    email: string,
    password: string,
    consents: { acceptedTerms: boolean; ageConfirmed: boolean },
  ) => Promise<{ pending: boolean; email: string }>;
  login: (username: string, password: string) => Promise<AuthUser>;
  resendVerification: (email: string) => Promise<void>;
  saveProfile: (aboutMe: string) => Promise<AuthUser>;
  saveAvatar: (image: string, mime: string) => Promise<AuthUser>;
  startPasswordChange: (oldPassword: string, newPassword: string) => Promise<{ challengeId: string }>;
  confirmPasswordChange: (challengeId: string, code: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [playToken, setPlayToken] = useState<string | null>(null);
  const [guestName, setGuest] = useState(getGuestName);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then((r) => {
        setUser(r.user);
        setPlayToken(r.playToken || null);
      })
      .catch(() => {
        setUser(null);
        setPlayToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      playToken,
      guestName,
      displayName: user?.username || guestName,
      ready,
      error,
      setError,
      setUser,
      setGuestName: (name: string) => {
        persistGuest(name);
        setGuest(name);
      },
      async register(
        username: string,
        email: string,
        password: string,
        consents: { acceptedTerms: boolean; ageConfirmed: boolean },
      ) {
        const r = await registerApi(username, email, password, consents);
        queuePendingAchievement("welcome", username);
        resetSocket();
        setError("");
        return r;
      },
      async login(username: string, password: string) {
        const r = await loginApi(username, password);
        resetSocket();
        setUser(r.user);
        setPlayToken(r.playToken || null);
        setError("");
        return r.user;
      },
      async resendVerification(email: string) {
        await resendApi(email);
      },
      async saveProfile(aboutMe: string) {
        const r = await saveProfileApi(aboutMe);
        setUser(r.user);
        if (r.playToken) setPlayToken(r.playToken);
        return r.user;
      },
      async saveAvatar(image: string, mime: string) {
        const r = await saveAvatarApi(image, mime);
        setUser(r.user);
        if (r.playToken) setPlayToken(r.playToken);
        return r.user;
      },
      async startPasswordChange(oldPassword: string, newPassword: string) {
        return startPasswordApi(oldPassword, newPassword);
      },
      async confirmPasswordChange(challengeId: string, code: string) {
        await confirmPasswordApi(challengeId, code);
      },
      async deleteAccount(password: string) {
        await deleteAccountApi(password);
        resetSocket();
        setUser(null);
        setPlayToken(null);
      },
      async logout() {
        await logoutApi();
        resetSocket();
        setUser(null);
        setPlayToken(null);
      },
    }),
    [error, guestName, playToken, ready, user],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth needs AuthProvider.");
  return ctx;
}

export type { AuthState };
