import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env.ts";

export type DbUser = {
  id: string;
  username: string;
  email: string | null;
  email_verified: number;
  password_hash: string;
  about_me: string | null;
  avatar_path: string | null;
};

type AccountRow = {
  id: string;
  username: string;
  email: string | null;
  email_verified: boolean;
  password_hash: string;
  email_verify_sent_at: string | null;
  about_me: string | null;
  avatar_path: string | null;
};

const BASE_ACCOUNT_COLS = "id, username, email, email_verified, password_hash, email_verify_sent_at";
const ACCOUNT_COLS_FULL = `${BASE_ACCOUNT_COLS}, about_me, avatar_path`;
let accountCols = ACCOUNT_COLS_FULL;

function useBaseAccountCols(error: { message?: string } | null) {
  if (accountCols === ACCOUNT_COLS_FULL && error?.message && /about_me|avatar_path/.test(error.message)) {
    accountCols = BASE_ACCOUNT_COLS;
    return true;
  }
  return false;
}

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
    about_me: row.about_me ?? null,
    avatar_path: row.avatar_path ?? null,
  };
}

function dbError(error: { message?: string } | null, fallback: string) {
  throw new Error(error?.message || fallback);
}

async function accountQuery<T>(
  run: (cols: string) => PromiseLike<{ data: T | null; error: { message?: string } | null }>,
  fallback: string,
): Promise<T | null> {
  const first = await run(accountCols);
  if (first.error && useBaseAccountCols(first.error)) {
    const second = await run(accountCols);
    if (second.error) dbError(second.error, fallback);
    return second.data;
  }
  if (first.error) dbError(first.error, fallback);
  return first.data;
}

export async function findUserByUsername(username: string): Promise<DbUser | undefined> {
  const data = await accountQuery(
    (cols) =>
      sb().from("accounts").select(cols).eq("username_lower", username.trim().toLowerCase()).maybeSingle(),
    "Could not look up that username.",
  );
  return data ? asUser(data as AccountRow) : undefined;
}

export async function findUserByEmail(email: string): Promise<DbUser | undefined> {
  const data = await accountQuery(
    (cols) => sb().from("accounts").select(cols).eq("email", email.trim().toLowerCase()).maybeSingle(),
    "Could not look up that email.",
  );
  return data ? asUser(data as AccountRow) : undefined;
}

export async function findUserById(id: string): Promise<DbUser | undefined> {
  const data = await accountQuery(
    (cols) => sb().from("accounts").select(cols).eq("id", id).maybeSingle(),
    "Could not look up that account.",
  );
  return data ? asUser(data as AccountRow) : undefined;
}

export async function insertUser(user: DbUser): Promise<void> {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    email_verified: Boolean(user.email_verified),
    password_hash: user.password_hash,
    about_me: user.about_me,
    avatar_path: user.avatar_path,
  };
  const { error } = await sb().from("accounts").insert(payload);
  if (error && useBaseAccountCols(error)) {
    const { error: retry } = await sb().from("accounts").insert({
      id: user.id,
      username: user.username,
      email: user.email,
      email_verified: Boolean(user.email_verified),
      password_hash: user.password_hash,
    });
    if (retry) dbError(retry, "Could not create that account.");
    return;
  }
  if (error) dbError(error, "Could not create that account.");
}

export async function createSession(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await sb().from("sessions").insert({ id, user_id: userId });
  if (error) dbError(error, "Could not start a session.");
  return id;
}

export async function findUserBySession(sessionId: string): Promise<DbUser | undefined> {
  const data = await accountQuery(
    (cols) =>
      sb()
        .from("sessions")
        .select(`id, accounts!user_id (${cols})`)
        .eq("id", sessionId)
        .maybeSingle(),
    "Could not look up that session.",
  );
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
  const data = await accountQuery(
    (cols) =>
      sb()
        .from("email_tokens")
        .select(`token_hash, expires_at, accounts!user_id (${cols})`)
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    "Could not check that verification link.",
  );
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

export async function updateProfile(
  userId: string,
  patch: { about_me?: string | null; avatar_path?: string | null },
): Promise<DbUser | undefined> {
  const { error } = await sb().from("accounts").update(patch).eq("id", userId);
  if (error) dbError(error, "Could not update that profile.");
  return findUserById(userId);
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  const { error } = await sb().from("accounts").update({ password_hash: passwordHash }).eq("id", userId);
  if (error) dbError(error, "Could not update that password.");
}

export async function replacePasswordReset(userId: string, tokenHash: string, expiresAt: number): Promise<void> {
  const { error: delError } = await sb().from("password_resets").delete().eq("user_id", userId);
  if (delError) dbError(delError, "Could not reset the password link.");
  const { error } = await sb().from("password_resets").insert({
    token_hash: tokenHash,
    user_id: userId,
    expires_at: new Date(expiresAt).toISOString(),
  });
  if (error) dbError(error, "Could not create the password reset link.");
}

export async function findUserByPasswordReset(tokenHash: string): Promise<DbUser | undefined> {
  const data = await accountQuery(
    (cols) =>
      sb()
        .from("password_resets")
        .select(`token_hash, expires_at, accounts!user_id (${cols})`)
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    "Could not check that reset link.",
  );
  const account = (data as { accounts?: AccountRow | AccountRow[] | null } | null)?.accounts;
  const row = Array.isArray(account) ? account[0] : account;
  return row ? asUser(row) : undefined;
}

export async function deletePasswordReset(tokenHash: string): Promise<void> {
  const { error } = await sb().from("password_resets").delete().eq("token_hash", tokenHash);
  if (error) dbError(error, "Could not consume that reset link.");
}

export async function createPasswordChallenge(
  userId: string,
  codeHash: string,
  newPasswordHash: string,
  expiresAt: number,
): Promise<string> {
  const id = crypto.randomUUID();
  await sb().from("password_challenges").delete().eq("user_id", userId);
  const { error } = await sb().from("password_challenges").insert({
    id,
    user_id: userId,
    code_hash: codeHash,
    new_password_hash: newPasswordHash,
    expires_at: new Date(expiresAt).toISOString(),
  });
  if (error) dbError(error, "Could not start the password change.");
  return id;
}

export async function takePasswordChallenge(
  id: string,
  userId: string,
  codeHash: string,
): Promise<{ userId: string; newPasswordHash: string } | undefined> {
  const { data, error } = await sb()
    .from("password_challenges")
    .select("id, user_id, code_hash, new_password_hash, expires_at")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("code_hash", codeHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) dbError(error, "Could not check that security code.");
  const row = data as
    | { user_id: string; new_password_hash: string }
    | null;
  if (!row) return undefined;
  await sb().from("password_challenges").delete().eq("id", id);
  return { userId: row.user_id, newPasswordHash: row.new_password_hash };
}

export async function ensureAvatarBucket(): Promise<void> {
  const { data } = await sb().storage.listBuckets();
  if (data?.some((bucket) => bucket.id === "avatars")) return;
  const { error } = await sb().storage.createBucket("avatars", {
    public: true,
    fileSizeLimit: "2MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
  if (error && !/already exists/i.test(error.message)) dbError(error, "Could not create the avatar bucket.");
}

export async function uploadAvatarFile(userId: string, bytes: Buffer, contentType: string): Promise<string> {
  await ensureAvatarBucket();
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/gif" ? "gif" : "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await sb().storage.from("avatars").upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) dbError(error, "Could not upload that photo.");
  return path;
}
