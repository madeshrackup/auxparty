import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  emptyPlayerStats,
  GAME_MODE_ORDER,
  type AchievementId,
  type GameMode,
  type PlayerStats,
} from "../../shared/types.ts";
import { IS_PROD, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env.ts";
import { assertUuid, isUuid, sanitizeText } from "./security.ts";

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
  if (!IS_PROD && error?.message) throw new Error(error.message);
  throw new Error(fallback);
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
    terms_accepted_at: new Date().toISOString(),
    age_confirmed: true,
  };
  const { error } = await sb().from("accounts").insert(payload);
  if (error && /terms_accepted_at|age_confirmed/.test(error.message || "")) {
    const { terms_accepted_at: _t, age_confirmed: _a, ...rest } = payload as Record<string, unknown>;
    const retry = await sb().from("accounts").insert(rest);
    if (retry.error && useBaseAccountCols(retry.error)) {
      const { error: baseErr } = await sb().from("accounts").insert({
        id: user.id,
        username: user.username,
        email: user.email,
        email_verified: Boolean(user.email_verified),
        password_hash: user.password_hash,
      });
      if (baseErr) dbError(baseErr, "Could not create that account.");
      return;
    }
    if (retry.error) dbError(retry.error, "Could not create that account.");
    return;
  }
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

export async function deleteSessionsForUser(userId: string): Promise<void> {
  const { error } = await sb().from("sessions").delete().eq("user_id", assertUuid(userId, "account"));
  if (error) dbError(error, "Could not end those sessions.");
}

let loginLockCols = true;
let securityEventsEnabled = true;

function disableLoginLock(error: { message?: string } | null) {
  if (loginLockCols && error?.message && /failed_login_count|locked_until|last_failed_login_at/.test(error.message)) {
    loginLockCols = false;
    return true;
  }
  return false;
}

export async function getLoginLock(userId: string): Promise<{ count: number; lockedUntil: number | null }> {
  if (!loginLockCols) return { count: 0, lockedUntil: null };
  const { data, error } = await sb()
    .from("accounts")
    .select("failed_login_count, locked_until")
    .eq("id", assertUuid(userId, "account"))
    .maybeSingle();
  if (error && disableLoginLock(error)) return { count: 0, lockedUntil: null };
  if (error) dbError(error, "Could not check account lock.");
  const row = data as { failed_login_count?: number | null; locked_until?: string | null } | null;
  const lockedUntil = row?.locked_until ? Date.parse(row.locked_until) : NaN;
  return {
    count: Math.max(0, Number(row?.failed_login_count) || 0),
    lockedUntil: Number.isFinite(lockedUntil) ? lockedUntil : null,
  };
}

export async function recordFailedLogin(userId: string, limit = 8, lockMs = 30 * 60_000): Promise<boolean> {
  if (!loginLockCols) return false;
  const state = await getLoginLock(userId);
  if (!loginLockCols) return false;
  const now = Date.now();
  const lockExpired = Boolean(state.lockedUntil && state.lockedUntil <= now);
  const nextCount = lockExpired ? 1 : state.count + 1;
  const lockNow = nextCount >= limit;
  const { error } = await sb()
    .from("accounts")
    .update({
      failed_login_count: nextCount,
      last_failed_login_at: new Date(now).toISOString(),
      locked_until: lockNow ? new Date(now + lockMs).toISOString() : null,
    })
    .eq("id", assertUuid(userId, "account"));
  if (error && disableLoginLock(error)) return false;
  if (error) dbError(error, "Could not record that sign-in attempt.");
  return lockNow;
}

export async function clearLoginLock(userId: string): Promise<void> {
  if (!loginLockCols) return;
  const { error } = await sb()
    .from("accounts")
    .update({ failed_login_count: 0, locked_until: null })
    .eq("id", assertUuid(userId, "account"));
  if (error && disableLoginLock(error)) return;
  if (error) dbError(error, "Could not clear account lock.");
}

export async function logSecurityEvent(
  event: string,
  opts?: { userId?: string; ip?: string; detail?: string },
): Promise<void> {
  const row = {
    event: sanitizeText(event, 64),
    user_id: opts?.userId && isUuid(opts.userId) ? opts.userId : null,
    ip: opts?.ip ? sanitizeText(opts.ip, 64) : null,
    detail: opts?.detail ? sanitizeText(opts.detail, 200) : null,
  };
  console.info(JSON.stringify({ src: "aux-security", at: new Date().toISOString(), ...row }));
  if (!securityEventsEnabled || !row.event) return;
  try {
    const { error } = await sb().from("security_events").insert(row);
    if (error) {
      if (/security_events|schema cache|does not exist/i.test(error.message || "")) {
        securityEventsEnabled = false;
        return;
      }
      console.warn("[security] log failed", error.message);
    }
  } catch (err) {
    console.warn("[security] log failed", err);
  }
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
  const next: { about_me?: string | null; avatar_path?: string | null } = {};
  if (patch.about_me !== undefined) next.about_me = patch.about_me;
  if (patch.avatar_path !== undefined) next.avatar_path = patch.avatar_path;
  if (!Object.keys(next).length) return findUserById(userId);
  const { error } = await sb().from("accounts").update(next).eq("id", userId);
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

export async function deletePasswordChallengesForUser(userId: string): Promise<void> {
  const { error } = await sb().from("password_challenges").delete().eq("user_id", assertUuid(userId, "account"));
  if (error) dbError(error, "Could not clear password change codes.");
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
  const owner = assertUuid(userId, "account");
  await ensureAvatarBucket();
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/gif" ? "gif" : "jpg";
  const path = `${owner}/avatar-${Date.now()}.${ext}`;
  const { error } = await sb().storage.from("avatars").upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) dbError(error, "Could not upload that photo.");
  return path;
}

export async function deleteAccount(userId: string): Promise<void> {
  try {
    const { data } = await sb().storage.from("avatars").list(userId);
    const files = (data || []).map((file) => `${userId}/${file.name}`);
    if (files.length) await sb().storage.from("avatars").remove(files);
  } catch {
    /* avatars bucket may be missing */
  }
  const { error } = await sb().from("accounts").delete().eq("id", userId);
  if (error) dbError(error, "Could not delete that account.");
}

export type FriendAccount = {
  id: string;
  username: string;
  avatar_path: string | null;
  message?: string | null;
};

function asFriendAccount(
  row: { id: string; username: string; avatar_path?: string | null },
  message?: string | null,
): FriendAccount {
  return { id: row.id, username: row.username, avatar_path: row.avatar_path ?? null, message: message || null };
}

function socialError(error: { message?: string } | null, fallback: string) {
  if (error?.message && /friendships|friend_requests|friend_messages/.test(error.message)) {
    throw new Error("Friends aren't set up on this server yet. Run supabase/schema-friends.sql.");
  }
  dbError(error, fallback);
}

export async function listFriendIds(userId: string): Promise<string[]> {
  const { data, error } = await sb().from("friendships").select("friend_id").eq("user_id", userId);
  if (error) socialError(error, "Could not load friends.");
  return ((data || []) as { friend_id: string }[]).map((row) => row.friend_id);
}

export async function listFriendAccounts(userId: string): Promise<FriendAccount[]> {
  const ids = await listFriendIds(userId);
  if (ids.length === 0) return [];
  const { data, error } = await sb().from("accounts").select("id, username, avatar_path").in("id", ids);
  if (error) socialError(error, "Could not load friends.");
  return ((data || []) as { id: string; username: string; avatar_path: string | null }[]).map((row) =>
    asFriendAccount(row),
  );
}

export async function listFriendRequests(userId: string): Promise<{
  incoming: FriendAccount[];
  outgoing: FriendAccount[];
}> {
  const incoming = await loadRequestSide(userId, "incoming");
  const outgoing = await loadRequestSide(userId, "outgoing");
  return { incoming, outgoing };
}

async function loadRequestSide(userId: string, side: "incoming" | "outgoing"): Promise<FriendAccount[]> {
  const selfCol = side === "incoming" ? "to_id" : "from_id";
  const otherCol = side === "incoming" ? "from_id" : "to_id";
  const first = await sb()
    .from("friend_requests")
    .select(`${otherCol}, message, accounts:${otherCol} (id, username, avatar_path)`)
    .eq(selfCol, userId);
  const usedMessage = !first.error;
  const result = first.error
    ? await sb()
        .from("friend_requests")
        .select(`${otherCol}, accounts:${otherCol} (id, username, avatar_path)`)
        .eq(selfCol, userId)
    : first;
  if (result.error) socialError(result.error, "Could not load friend requests.");
  return ((result.data || []) as {
    message?: string | null;
    accounts?: FriendAccount | FriendAccount[] | null;
  }[])
    .map((row) => {
      const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
      return account ? asFriendAccount(account, usedMessage ? row.message : null) : null;
    })
    .filter((row): row is FriendAccount => Boolean(row));
}

export async function searchAccounts(
  userId: string,
  query: string,
): Promise<(FriendAccount & { status: "none" | "friends" | "outgoing" | "incoming" })[]> {
  const q = query.trim().toLowerCase().replace(/[%_\\]/g, "");
  if (q.length < 2) return [];
  const { data, error } = await sb()
    .from("accounts")
    .select("id, username, avatar_path")
    .ilike("username_lower", `%${q}%`)
    .neq("id", userId)
    .limit(8);
  if (error) socialError(error, "Could not search accounts.");
  const rows = ((data || []) as { id: string; username: string; avatar_path: string | null }[]).map((row) =>
    asFriendAccount(row),
  );
  if (rows.length === 0) return [];
  const friendIds = new Set(await listFriendIds(userId));
  const { incoming, outgoing } = await listFriendRequests(userId);
  const incomingIds = new Set(incoming.map((row) => row.id));
  const outgoingIds = new Set(outgoing.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    status: friendIds.has(row.id)
      ? "friends"
      : outgoingIds.has(row.id)
        ? "outgoing"
        : incomingIds.has(row.id)
          ? "incoming"
          : "none",
  }));
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const { data, error } = await sb()
    .from("friendships")
    .select("friend_id")
    .eq("user_id", a)
    .eq("friend_id", b)
    .maybeSingle();
  if (error) socialError(error, "Could not check that friendship.");
  return Boolean(data);
}

export async function createFriendRequest(
  fromId: string,
  username: string,
  message = "",
): Promise<FriendAccount> {
  const target = await findUserByUsername(username);
  if (!target) throw new Error("No account with that username.");
  if (target.id === fromId) throw new Error("You can't add yourself.");
  if (await areFriends(fromId, target.id)) throw new Error("You're already friends.");
  const note = sanitizeText(message, 200);

  const { data: reverse } = await sb()
    .from("friend_requests")
    .select("from_id")
    .eq("from_id", target.id)
    .eq("to_id", fromId)
    .maybeSingle();
  if (reverse) {
    await acceptFriendRequest(fromId, target.id);
    return { id: target.id, username: target.username, avatar_path: target.avatar_path };
  }

  const row = {
    id: crypto.randomUUID(),
    from_id: fromId,
    to_id: target.id,
    message: note || null,
  };
  const { error } = await sb().from("friend_requests").insert(row);
  if (error && /message/.test(error.message || "")) {
    const { error: retry } = await sb().from("friend_requests").insert({
      id: row.id,
      from_id: fromId,
      to_id: target.id,
    });
    if (retry) {
      if (/duplicate|unique/i.test(retry.message || "")) {
        throw new Error("You already sent them a request.");
      }
      socialError(retry, "Could not send that request.");
    }
    return { id: target.id, username: target.username, avatar_path: target.avatar_path };
  }
  if (error) {
    if (/duplicate|unique/i.test(error.message || "")) {
      throw new Error("You already sent them a request.");
    }
    socialError(error, "Could not send that request.");
  }
  return { id: target.id, username: target.username, avatar_path: target.avatar_path };
}

export async function acceptFriendRequest(userId: string, fromId: string): Promise<void> {
  const { data, error } = await sb()
    .from("friend_requests")
    .select("from_id")
    .eq("from_id", fromId)
    .eq("to_id", userId)
    .maybeSingle();
  if (error) socialError(error, "Could not accept that request.");
  if (!data) throw new Error("No request from that player.");
  const { error: insErr } = await sb().from("friendships").insert([
    { user_id: userId, friend_id: fromId },
    { user_id: fromId, friend_id: userId },
  ]);
  if (insErr && !/duplicate|unique/i.test(insErr.message || "")) {
    socialError(insErr, "Could not add that friend.");
  }
  await sb().from("friend_requests").delete().eq("from_id", fromId).eq("to_id", userId);
  await sb().from("friend_requests").delete().eq("from_id", userId).eq("to_id", fromId);
}

export async function declineFriendRequest(userId: string, otherId: string): Promise<void> {
  const { error: a } = await sb().from("friend_requests").delete().eq("from_id", otherId).eq("to_id", userId);
  const { error: b } = await sb().from("friend_requests").delete().eq("from_id", userId).eq("to_id", otherId);
  if (a) socialError(a, "Could not decline that request.");
  if (b) socialError(b, "Could not decline that request.");
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  const { error: a } = await sb().from("friendships").delete().eq("user_id", userId).eq("friend_id", friendId);
  const { error: b } = await sb().from("friendships").delete().eq("user_id", friendId).eq("friend_id", userId);
  if (a) socialError(a, "Could not remove that friend.");
  if (b) socialError(b, "Could not remove that friend.");
}

export async function insertFriendMessage(fromId: string, toId: string, body: string): Promise<{
  id: string;
  createdAt: number;
  body: string;
}> {
  if (!(await areFriends(fromId, toId))) throw new Error("You can only message friends.");
  const text = sanitizeText(body, 500);
  if (text.length < 1) throw new Error("Type a message first.");
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const { error } = await sb().from("friend_messages").insert({
    id,
    from_id: fromId,
    to_id: toId,
    body: text,
    created_at: new Date(createdAt).toISOString(),
  });
  if (error) socialError(error, "Could not send that message.");
  return { id, createdAt, body: text };
}

export async function listFriendMessages(userId: string, otherId: string, limit = 50): Promise<{
  id: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
}[]> {
  if (!(await areFriends(userId, otherId))) throw new Error("You can only message friends.");
  const self = assertUuid(userId, "account");
  const other = assertUuid(otherId, "player");
  const [{ data: sent, error: sentErr }, { data: received, error: receivedErr }] = await Promise.all([
    sb()
      .from("friend_messages")
      .select("id, from_id, to_id, body, created_at")
      .eq("from_id", self)
      .eq("to_id", other)
      .order("created_at", { ascending: false })
      .limit(limit),
    sb()
      .from("friend_messages")
      .select("id, from_id, to_id, body, created_at")
      .eq("from_id", other)
      .eq("to_id", self)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (sentErr) socialError(sentErr, "Could not load messages.");
  if (receivedErr) socialError(receivedErr, "Could not load messages.");
  const rows = ([...(sent || []), ...(received || [])] as {
    id: string;
    from_id: string;
    to_id: string;
    body: string;
    created_at: string;
  }[]).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return rows.slice(-limit);
}

export async function grantAchievement(userId: string, achievementId: string): Promise<boolean> {
  try {
    const { error } = await sb().from("achievements").insert({
      user_id: userId,
      achievement_id: achievementId,
    });
    if (!error) return true;
    if (error.code === "23505") return false;
    if (!/achievements|schema cache|does not exist|duplicate/i.test(error.message || "")) {
      return false;
    }
  } catch {
    /* trophies stay optional until schema-achievements.sql is applied */
  }
  return false;
}

export async function loadAchievements(userId: string): Promise<{
  unlocked: { id: string; unlockedAt: number }[];
  wins: number;
}> {
  await grantAchievement(userId, "welcome");
  let wins = 0;
  const winsRes = await sb().from("accounts").select("wins").eq("id", userId).maybeSingle();
  if (!winsRes.error) wins = Number((winsRes.data as { wins?: number } | null)?.wins || 0);
  if (wins >= 1) await grantAchievement(userId, "first_of_many");
  if (wins >= 100) await grantAchievement(userId, "maestro");

  const { data, error } = await sb()
    .from("achievements")
    .select("achievement_id, unlocked_at")
    .eq("user_id", userId);
  if (error) {
    return { unlocked: [{ id: "welcome", unlockedAt: Date.now() }], wins };
  }
  return {
    wins,
    unlocked: ((data || []) as { achievement_id: string; unlocked_at: string }[]).map((row) => ({
      id: row.achievement_id,
      unlockedAt: Date.parse(row.unlocked_at) || Date.now(),
    })),
  };
}

function asInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseModeStats(raw: unknown): PlayerStats["modes"] {
  const modes = emptyPlayerStats().modes;
  if (!raw || typeof raw !== "object") return modes;
  const bag = raw as Record<string, { wins?: unknown; points?: unknown }>;
  for (const mode of GAME_MODE_ORDER) {
    const row = bag[mode];
    if (!row) continue;
    modes[mode] = { wins: asInt(row.wins), points: asInt(row.points) };
  }
  return modes;
}

export async function loadStats(userId: string): Promise<PlayerStats> {
  const stats = emptyPlayerStats();
  const full = await sb()
    .from("accounts")
    .select("wins, points, mode_stats")
    .eq("id", userId)
    .maybeSingle();
  if (full.error && /points|mode_stats/.test(full.error.message || "")) {
    const slim = await sb().from("accounts").select("wins").eq("id", userId).maybeSingle();
    if (!slim.error) stats.wins = asInt((slim.data as { wins?: number } | null)?.wins);
  } else if (!full.error) {
    const row = full.data as { wins?: number; points?: number; mode_stats?: unknown } | null;
    stats.wins = asInt(row?.wins);
    stats.points = asInt(row?.points);
    stats.modes = parseModeStats(row?.mode_stats);
  }

  const { data, error } = await sb().from("achievements").select("achievement_id").eq("user_id", userId);
  if (!error) stats.trophies = (data || []).length;
  return stats;
}

export async function recordMatchStats(
  mode: GameMode,
  entries: { userId: string; score: number; won: boolean }[],
): Promise<{ userId: string; id: AchievementId }[]> {
  const granted: { userId: string; id: AchievementId }[] = [];
  const unique = new Map<string, { userId: string; score: number; won: boolean }>();
  for (const entry of entries) {
    if (entry.userId) unique.set(entry.userId, entry);
  }
  for (const entry of unique.values()) {
    const current = await sb()
      .from("accounts")
      .select("wins, points, mode_stats")
      .eq("id", entry.userId)
      .maybeSingle();
    if (current.error && /points|mode_stats/.test(current.error.message || "")) {
      if (entry.won) {
        const slim = await sb().from("accounts").select("wins").eq("id", entry.userId).maybeSingle();
        if (slim.error) continue;
        const wins = asInt((slim.data as { wins?: number } | null)?.wins) + 1;
        const { error } = await sb().from("accounts").update({ wins }).eq("id", entry.userId);
        if (!error && wins === 1 && (await grantAchievement(entry.userId, "first_of_many"))) {
          granted.push({ userId: entry.userId, id: "first_of_many" });
        }
        if (!error && wins >= 100 && (await grantAchievement(entry.userId, "maestro"))) {
          granted.push({ userId: entry.userId, id: "maestro" });
        }
      }
      continue;
    }
    if (current.error) continue;
    const row = current.data as { wins?: number; points?: number; mode_stats?: unknown } | null;
    const wins = asInt(row?.wins) + (entry.won ? 1 : 0);
    const points = asInt(row?.points) + entry.score;
    const modes = parseModeStats(row?.mode_stats);
    modes[mode] = {
      wins: modes[mode].wins + (entry.won ? 1 : 0),
      points: modes[mode].points + entry.score,
    };
    const { error } = await sb()
      .from("accounts")
      .update({ wins, points, mode_stats: modes })
      .eq("id", entry.userId);
    if (error) continue;
    if (entry.won && wins === 1 && (await grantAchievement(entry.userId, "first_of_many"))) {
      granted.push({ userId: entry.userId, id: "first_of_many" });
    }
    if (wins >= 100 && (await grantAchievement(entry.userId, "maestro"))) {
      granted.push({ userId: entry.userId, id: "maestro" });
    }
  }
  return granted;
}
