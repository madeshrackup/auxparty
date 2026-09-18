import { Resend } from "resend";
import { APP_URL, EMAIL_FROM, IS_PROD, RESEND_API_KEY } from "./env.ts";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendVerificationEmail(to: string, token: string) {
  const verifyUrl = `${APP_URL}/verify?token=${encodeURIComponent(token)}`;
  const html = verificationHtml(verifyUrl);
  const text = `Verify your Aux Party email:\n${verifyUrl}\n\nThis link expires in 24 hours.`;

  if (!resend) {
    if (IS_PROD) throw new Error("Email isn't configured on the server.");
    console.log(`[auth] Verification link for ${to}: ${verifyUrl}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: "Verify your Aux Party email",
    html,
    text,
  });
  if (error) throw new Error(error.message || "Could not send the verification email.");
}

function verificationHtml(verifyUrl: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#c13ae0;font-family:Arial,sans-serif;color:#fff;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:linear-gradient(180deg,#6a24ea,#26107a);border:4px solid #fff;border-radius:24px;padding:28px;">
      <tr>
        <td>
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.2em;color:#c6ff3d;font-weight:700;">AUX PARTY</p>
          <h1 style="margin:0 0 12px;font-size:28px;">Confirm your email</h1>
          <p style="margin:0 0 24px;line-height:1.5;color:#e9d4ff;">One tap and your account is live. This link expires in 24 hours.</p>
          <a href="${verifyUrl}" style="display:inline-block;background:#c6ff3d;color:#5a117c;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:14px;border:3px solid #fff;">Verify my email</a>
          <p style="margin:24px 0 0;font-size:12px;color:#e9d4ff;word-break:break-all;">Or paste this into your browser:<br>${verifyUrl}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
