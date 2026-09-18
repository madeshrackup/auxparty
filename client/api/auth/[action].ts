import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { authAction } = await import("../../../server/src/vercel-routes.ts");
    await authAction(req, res);
  } catch (err) {
    if (res.headersSent) return;
    res.status(500).json({ error: err instanceof Error ? err.message : "Auth function failed." });
  }
}
