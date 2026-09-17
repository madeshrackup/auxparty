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
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE)");

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
