import { EMAIL_FROM, RESEND_API_KEY } from "../src/env.ts";
import { sendVerificationEmail } from "../src/mail.ts";

const to = (process.argv[2] || "").trim();
if (!to || !to.includes("@")) {
  console.error("Usage: npm run email:test -- you@email.com");
  process.exit(1);
}
if (!RESEND_API_KEY) {
  console.error("Add RESEND_API_KEY to the repo-root .env first.");
  process.exit(1);
}

await sendVerificationEmail(to, "preview");
console.log(`Sent from ${EMAIL_FROM} to ${to}`);
console.log("The verify button is a preview link and will not sign you in.");
