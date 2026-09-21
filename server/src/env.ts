import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  loadEnv({ path: path.join(root, ".env"), override: true, quiet: true });
} catch {
  try {
    loadEnv({ override: true, quiet: true });
  } catch {
    /* Vercel injects env vars. */
  }
}

function httpsUrl(host: string) {
  return host.startsWith("http") ? host : `https://${host}`;
}

export const SUPABASE_URL = (
  process.env.SUPABASE_URL || "https://xgypeovqxzazhbucguzt.supabase.co"
).replace(/\/$/, "");
export const SUPABASE_SERVICE_ROLE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  ""
).trim();

export const IS_PROD = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

export const APP_URL = (
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? httpsUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    : "") ||
  (process.env.VERCEL ? "https://auxparty.co.uk" : "http://localhost:5173")
).replace(/\/$/, "");
export const EMAIL_FROM = process.env.EMAIL_FROM || "Aux Party <beth.t@example.com>";
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
export const PLAY_TOKEN_SECRET = (process.env.PLAY_TOKEN_SECRET || SUPABASE_SERVICE_ROLE_KEY).trim();

export function assertProductionEnv() {
  if (!IS_PROD) return;
  const missing: string[] = [];
  if (!SUPABASE_URL.startsWith("https://")) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!process.env.EMAIL_FROM) missing.push("EMAIL_FROM");
  if (!APP_URL.startsWith("https://")) missing.push("APP_URL (https)");
  if (missing.length) {
    throw new Error(`Production env is incomplete: ${missing.join(", ")}`);
  }
}
