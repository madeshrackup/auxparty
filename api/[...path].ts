import type { VercelRequest, VercelResponse } from "@vercel/node";
import { app } from "../server/src/app.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const url = req.url || "/";
  if (!url.startsWith("/api")) {
    req.url = url.startsWith("/") ? `/api${url}` : `/api/${url}`;
  }
  return app(req, res);
}
