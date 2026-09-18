import { ensureAvatarBucket } from "../src/db.ts";

await ensureAvatarBucket();
console.log("avatars bucket is ready");
