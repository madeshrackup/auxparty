import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.join(root, ".env") });

function httpsUrl(host: string) {
  return host.startsWith("http") ? host : `https://${host}`;
}

export const SUPABASE_URL = (
  process.env.SUPABASE_URL || "https://xgypeovqxzazhbucguzt.supabase.co"
).replace(/\/$/, "");
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const APP_URL = (
  process.env.APP_URL ||
  (process.env.VERCEL_URL ? httpsUrl(process.env.VERCEL_URL) : "http://localhost:5173")
).replace(/\/$/, "");
export const EMAIL_FROM = process.env.EMAIL_FROM || "Aux Party <beth.t@example.com>";
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
export const IS_PROD = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
