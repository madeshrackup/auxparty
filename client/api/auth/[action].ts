import type { VercelRequest, VercelResponse } from "@vercel/node";

// Auth graph must not value-import named exports from shared/types.ts (Vercel ESM).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { authAction } = await import("../../../server/src/vercel-routes.ts");
    await authAction(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth handler failed.";
    console.error("[auth]", err);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}
