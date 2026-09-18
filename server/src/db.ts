import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "auxparty.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT UNIQUE COLLATE NOCASE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
`);

const userColumns = (
  db.prepare("PRAGMA table_info(users)").all() as { name: string }[]
).map((col) => col.name);
if (!userColumns.includes("email")) {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT");
}
if (!userColumns.includes("email_verified")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.includes("email_verify_sent_at")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verify_sent_at INTEGER");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE)");

db.exec(`
  CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);

const USER_COLS = "id, username, email, email_verified, password_hash";

export type DbUser = {
  id: string;
  username: string;
  email: string | null;
  email_verified: number;
  password_hash: string;
};

export function findUserByUsername(username: string): DbUser | undefined {
  return db
    .prepare(`SELECT ${USER_COLS} FROM users WHERE username = ?`)
    .get(username) as DbUser | undefined;
}

export function findUserByEmail(email: string): DbUser | undefined {
  return db
    .prepare(`SELECT ${USER_COLS} FROM users WHERE email = ? COLLATE NOCASE`)
    .get(email) as DbUser | undefined;
}

export function findUserById(id: string): DbUser | undefined {
  return db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as DbUser | undefined;
}

export function insertUser(user: DbUser): void {
  db.prepare(
    "INSERT INTO users (id, username, email, email_verified, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(user.id, user.username, user.email, user.email_verified, user.password_hash, Date.now());
}

export function createSession(userId: string): string {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)").run(
    id,
    userId,
    Date.now(),
  );
  return id;
}

export function findUserBySession(sessionId: string): DbUser | undefined {
  return db
    .prepare(
      `SELECT u.id, u.username, u.email, u.email_verified, u.password_hash
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(sessionId) as DbUser | undefined;
}

export function deleteSession(sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function markEmailVerified(userId: string): void {
  db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
}

export function touchVerifySent(userId: string): void {
  db.prepare("UPDATE users SET email_verify_sent_at = ? WHERE id = ?").run(Date.now(), userId);
}

export function getVerifySentAt(userId: string): number | null {
  const row = db.prepare("SELECT email_verify_sent_at FROM users WHERE id = ?").get(userId) as
    | { email_verify_sent_at: number | null }
    | undefined;
  return row?.email_verify_sent_at ?? null;
}

export function replaceEmailToken(userId: string, tokenHash: string, expiresAt: number): void {
  db.prepare("DELETE FROM email_tokens WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO email_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    tokenHash,
    userId,
    expiresAt,
  );
}

export function findUserByEmailToken(tokenHash: string): DbUser | undefined {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.email_verified, u.password_hash
       FROM email_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.expires_at > ?`,
    )
    .get(tokenHash, now) as DbUser | undefined;
  return row;
}

export function deleteEmailToken(tokenHash: string): void {
  db.prepare("DELETE FROM email_tokens WHERE token_hash = ?").run(tokenHash);
}

export function deleteExpiredEmailTokens(): void {
  db.prepare("DELETE FROM email_tokens WHERE expires_at <= ?").run(Date.now());
}
