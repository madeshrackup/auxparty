import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env.ts";

export type DbUser = {
  id: string;
  username: string;
  email: string | null;
  email_verified: number;
  password_hash: string;
};

type AccountRow = {
  id: string;
  username: string;
  email: string | null;
  email_verified: boolean;
  password_hash: string;
  email_verify_sent_at: string | null;
};

const ACCOUNT_COLS = "id, username, email, email_verified, password_hash, email_verify_sent_at";

let client: SupabaseClient | null = null;

function sb() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service role key is missing. Set SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function asUser(row: AccountRow): DbUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    email_verified: row.email_verified ? 1 : 0,
    password_hash: row.password_hash,
  };
}

function dbError(error: { message?: string } | null, fallback: string) {
  throw new Error(error?.message || fallback);
}

export async function findUserByUsername(username: string): Promise<DbUser | undefined> {
  const { data, error } = await sb()
    .from("accounts")
    .select(ACCOUNT_COLS)
    .eq("username_lower", username.trim().toLowerCase())
    .maybeSingle();
  if (error) dbError(error, "Could not look up that username.");
  return data ? asUser(data as AccountRow) : undefined;
}

export async function findUserByEmail(email: string): Promise<DbUser | undefined> {
  const { data, error } = await sb()
    .from("accounts")
    .select(ACCOUNT_COLS)
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) dbError(error, "Could not look up that email.");
  return data ? asUser(data as AccountRow) : undefined;
}

export async function findUserById(id: string): Promise<DbUser | undefined> {
  const { data, error } = await sb().from("accounts").select(ACCOUNT_COLS).eq("id", id).maybeSingle();
  if (error) dbError(error, "Could not look up that account.");
  return data ? asUser(data as AccountRow) : undefined;
}

export async function insertUser(user: DbUser): Promise<void> {
  const { error } = await sb().from("accounts").insert({
    id: user.id,
    username: user.username,
    email: user.email,
    email_verified: Boolean(user.email_verified),
    password_hash: user.password_hash,
  });
  if (error) dbError(error, "Could not create that account.");
}

export async function createSession(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await sb().from("sessions").insert({ id, user_id: userId });
  if (error) dbError(error, "Could not start a session.");
  return id;
}

export async function findUserBySession(sessionId: string): Promise<DbUser | undefined> {
  const { data, error } = await sb()
    .from("sessions")
    .select(`id, accounts!user_id (${ACCOUNT_COLS})`)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) dbError(error, "Could not look up that session.");
  const account = (data as { accounts?: AccountRow | AccountRow[] | null } | null)?.accounts;
  const row = Array.isArray(account) ? account[0] : account;
  return row ? asUser(row) : undefined;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await sb().from("sessions").delete().eq("id", sessionId);
  if (error) dbError(error, "Could not sign out.");
}

export async function markEmailVerified(userId: string): Promise<void> {
  const { error } = await sb().from("accounts").update({ email_verified: true }).eq("id", userId);
  if (error) dbError(error, "Could not verify that email.");
}

export async function touchVerifySent(userId: string): Promise<void> {
  const { error } = await sb()
    .from("accounts")
    .update({ email_verify_sent_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) dbError(error, "Could not record the verification email.");
}

export async function getVerifySentAt(userId: string): Promise<number | null> {
  const { data, error } = await sb()
    .from("accounts")
    .select("email_verify_sent_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) dbError(error, "Could not check verification cooldown.");
  const raw = (data as { email_verify_sent_at?: string | null } | null)?.email_verify_sent_at;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export async function replaceEmailToken(userId: string, tokenHash: string, expiresAt: number): Promise<void> {
  const { error: delError } = await sb().from("email_tokens").delete().eq("user_id", userId);
  if (delError) dbError(delError, "Could not reset the verification link.");
  const { error } = await sb().from("email_tokens").insert({
    token_hash: tokenHash,
    user_id: userId,
    expires_at: new Date(expiresAt).toISOString(),
  });
  if (error) dbError(error, "Could not create the verification link.");
}

export async function findUserByEmailToken(tokenHash: string): Promise<DbUser | undefined> {
  const { data, error } = await sb()
    .from("email_tokens")
    .select(`token_hash, expires_at, accounts!user_id (${ACCOUNT_COLS})`)
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) dbError(error, "Could not check that verification link.");
  const account = (data as { accounts?: AccountRow | AccountRow[] | null } | null)?.accounts;
  const row = Array.isArray(account) ? account[0] : account;
  return row ? asUser(row) : undefined;
}

export async function deleteEmailToken(tokenHash: string): Promise<void> {
  const { error } = await sb().from("email_tokens").delete().eq("token_hash", tokenHash);
  if (error) dbError(error, "Could not consume that verification link.");
}

export async function deleteExpiredEmailTokens(): Promise<void> {
  const { error } = await sb().from("email_tokens").delete().lte("expires_at", new Date().toISOString());
  if (error) dbError(error, "Could not clean up verification links.");
}
