import { Resend } from "resend";
import { APP_URL, EMAIL_FROM, IS_PROD, RESEND_API_KEY } from "./env.ts";

const resend = () => (RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null);

function throwMailError(error: { message?: string } | null, fallback: string): never {
  const message = error?.message || fallback;
  if (/domain is not verified/i.test(message)) {
    throw new Error(
      `${message} Local EMAIL_FROM is ${EMAIL_FROM}. The from-domain must exactly match a domain verified on this Resend API key.`,
    );
  }
  throw new Error(message);
}

export async function sendVerificationEmail(to: string, token: string) {
  const verifyUrl = `${APP_URL}/verify?token=${encodeURIComponent(token)}`;
  const html = verificationHtml(verifyUrl, APP_URL);
  const text = [
    "AUX PARTY — THE MUSIC QUIZ",
    "",
    "Confirm your email",
    "Tap the link and your account is live. This link expires in 24 hours.",
    "",
    verifyUrl,
    "",
    `If you didn't create an Aux Party account, you can ignore this.`,
  ].join("\n");

  if (!resend()) {
    if (IS_PROD) throw new Error("Email isn't configured on the server.");
    console.log(`[auth] Verification link for ${to}: ${verifyUrl}`);
    return;
  }

  const { error } = await resend()!.emails.send({
    from: EMAIL_FROM,
    to,
    subject: "Confirm your Aux Party email",
    html,
    text,
  });
  if (error) throwMailError(error, "Could not send the verification email.");
}

async function deliver(to: string, subject: string, html: string, text: string, previewUrl?: string) {
  if (!resend()) {
    if (IS_PROD) throw new Error("Email isn't configured on the server.");
    console.log(`[auth] ${subject} for ${to}${previewUrl ? `: ${previewUrl}` : ""}`);
    return;
  }
  const { error } = await resend()!.emails.send({ from: EMAIL_FROM, to, subject, html, text });
  if (error) throwMailError(error, "Could not send that email.");
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const resetUrl = `${APP_URL}/reset?token=${encodeURIComponent(token)}`;
  const html = partyMailHtml({
    kicker: "PASSWORD",
    title: "Reset your password",
    body: "Use this link to pick a new password. Then return to Aux Party and log in with the new details. This link expires in 1 hour.",
    cta: "Choose a new password",
    href: resetUrl,
    footer: "If you didn’t ask to reset your password, you can ignore this.",
  });
  const text = [
    "AUX PARTY — THE MUSIC QUIZ",
    "",
    "Reset your password",
    "This link expires in 1 hour.",
    "",
    resetUrl,
    "",
    "If you didn't ask to reset your password, you can ignore this.",
  ].join("\n");
  await deliver(to, "Reset your Aux Party password", html, text, resetUrl);
}

export async function sendAccountLockedEmail(to: string, token: string) {
  const resetUrl = `${APP_URL}/reset?token=${encodeURIComponent(token)}`;
  const html = partyMailHtml({
    kicker: "SECURITY",
    title: "Your account is locked",
    body: "We locked this Aux Party account after too many failed sign-ins. Choose a new password with the button below to unlock it and sign in again. This link expires in 1 hour.",
    cta: "Choose a new password",
    href: resetUrl,
    footer: "If this wasn’t you, set a new password now and ignore any later sign-in attempts.",
  });
  const text = [
    "AUX PARTY — THE MUSIC QUIZ",
    "",
    "Your account is locked",
    "Too many failed sign-ins. Use this link to choose a new password and unlock your account. This link expires in 1 hour.",
    "",
    resetUrl,
    "",
    "If this wasn't you, set a new password now and ignore any later sign-in attempts.",
  ].join("\n");
  await deliver(to, "Your Aux Party account is locked", html, text, resetUrl);
}

export async function sendPasswordCodeEmail(to: string, code: string) {
  const html = partyMailHtml({
    kicker: "SECURITY",
    title: "Your 6-digit code",
    body: `Enter this code in Aux Party to finish changing your password. It expires in 10 minutes.`,
    code,
    footer: "If you didn’t ask to change your password, you can ignore this.",
  });
  const text = [
    "AUX PARTY — THE MUSIC QUIZ",
    "",
    `Your password change code is ${code}.`,
    "It expires in 10 minutes.",
    "",
    "If you didn't ask to change your password, you can ignore this.",
  ].join("\n");
  await deliver(to, "Your Aux Party security code", html, text);
}

function attr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function verificationHtml(verifyUrl: string, homeUrl: string) {
  const href = attr(verifyUrl);
  const home = attr(homeUrl);
  const font =
    "'Lilita One','Fredoka',Impact,'Arial Black',Arial,sans-serif";
  const bodyFont = "Fredoka,'Trebuchet MS',Arial,sans-serif";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Confirm your email</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Lilita+One&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:#c13ae0;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      One tap and your Aux Party account is live. This link expires in 24 hours.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#c13ae0" style="background:#c13ae0;background-image:linear-gradient(180deg,#d24af0 0%,#a12ad4 42%,#7b1cb8 100%);margin:0;padding:0;width:100%;">
      <tr>
        <td align="center" style="padding:36px 16px 48px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;">
            <tr>
              <td align="center" style="padding:0 0 18px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="10" height="10" bgcolor="#c6ff3d" style="background:#c6ff3d;border-radius:10px;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="8"></td>
                    <td width="10" height="10" bgcolor="#3ee0ff" style="background:#3ee0ff;border-radius:10px;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="8"></td>
                    <td width="10" height="10" bgcolor="#ff4db8" style="background:#ff4db8;border-radius:10px;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="8"></td>
                    <td width="10" height="10" bgcolor="#ffd24a" style="background:#ffd24a;border-radius:10px;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="#5b1ad4" style="background:#5b1ad4;background-image:linear-gradient(180deg,#6a24ea 0%,#3f14b6 46%,#26107a 100%);border:4px solid #ffffff;border-radius:28px;box-shadow:0 10px 0 #5a117c;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:22px 24px 8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td valign="middle" width="52">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td width="48" height="34" bgcolor="#ff4db8" style="background:#ff4db8;border:3px solid #ffffff;border-radius:12px 12px 18px 18px;box-shadow:0 4px 0 #5a117c;text-align:center;vertical-align:middle;">
                                  <span style="display:inline-block;width:10px;height:10px;background:#ffffff;border-radius:10px;font-size:0;line-height:0;">&nbsp;</span>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td valign="middle" style="padding-left:10px;">
                            <a href="${home}" style="text-decoration:none;color:#ffffff;">
                              <div style="font-family:${font};font-size:28px;line-height:0.9;letter-spacing:0.03em;color:#ffffff;text-shadow:0 3px 0 #5a117c;">AUX PARTY</div>
                              <div style="font-family:${bodyFont};font-size:10px;letter-spacing:0.28em;font-weight:700;color:#ffffff;opacity:0.9;padding-top:4px;">THE MUSIC QUIZ</div>
                            </a>
                          </td>
                          <td valign="middle" align="right">
                            <span style="display:inline-block;background:#7a1ea8;border:3px solid #ffffff;border-radius:999px;padding:5px 12px;font-family:${bodyFont};font-size:11px;font-weight:700;color:#ffffff;">PARTY MODE</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 24px 28px;">
                      <div style="font-family:${bodyFont};font-size:12px;letter-spacing:0.2em;font-weight:700;color:#c6ff3d;padding-bottom:8px;">ACCOUNT</div>
                      <h1 style="margin:0 0 10px;font-family:${font};font-size:36px;line-height:0.95;letter-spacing:0.03em;color:#ffffff;">Confirm your email</h1>
                      <p style="margin:0 0 22px;font-family:${bodyFont};font-size:16px;line-height:1.5;font-weight:600;color:#e9d4ff;">
                        One tap and your account is live. Then jump into private rooms and put the aux on the line.
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td bgcolor="#c6ff3d" style="background:#c6ff3d;border:3px solid #ffffff;border-radius:16px;box-shadow:0 5px 0 #5a117c;">
                            <a href="${href}" style="display:inline-block;padding:12px 26px;font-family:${font};font-size:22px;letter-spacing:0.03em;color:#5a117c;text-decoration:none;">Verify my email</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:22px 0 0;font-family:${bodyFont};font-size:12px;line-height:1.5;font-weight:600;color:#e9d4ff;">
                        This link expires in 24 hours. If the button does nothing, paste this into your browser:
                      </p>
                      <p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;color:#c6ff3d;word-break:break-all;">
                        <a href="${href}" style="color:#c6ff3d;text-decoration:underline;">${href}</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 8px 0;font-family:${bodyFont};font-size:12px;line-height:1.5;font-weight:600;color:#ffe9ff;">
                If you didn’t create an Aux Party account, you can ignore this.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function partyMailHtml(opts: {
  kicker: string;
  title: string;
  body: string;
  cta?: string;
  href?: string;
  code?: string;
  footer: string;
}) {
  const href = opts.href ? attr(opts.href) : "";
  const home = attr(APP_URL);
  const font = "'Lilita One','Fredoka',Impact,'Arial Black',Arial,sans-serif";
  const bodyFont = "Fredoka,'Trebuchet MS',Arial,sans-serif";
  const action = opts.code
    ? `<div style="display:inline-block;background:#c6ff3d;border:3px solid #ffffff;border-radius:16px;box-shadow:0 5px 0 #5a117c;padding:12px 26px;font-family:${font};font-size:32px;letter-spacing:0.28em;color:#5a117c;">${attr(opts.code)}</div>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#c6ff3d" style="background:#c6ff3d;border:3px solid #ffffff;border-radius:16px;box-shadow:0 5px 0 #5a117c;"><a href="${href}" style="display:inline-block;padding:12px 26px;font-family:${font};font-size:22px;letter-spacing:0.03em;color:#5a117c;text-decoration:none;">${attr(opts.cta || "Open Aux Party")}</a></td></tr></table>`;
  const paste = opts.href
    ? `<p style="margin:22px 0 0;font-family:${bodyFont};font-size:12px;line-height:1.5;font-weight:600;color:#e9d4ff;">If the button does nothing, paste this into your browser:</p><p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;color:#c6ff3d;word-break:break-all;"><a href="${href}" style="color:#c6ff3d;text-decoration:underline;">${href}</a></p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${attr(opts.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#c13ae0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#c13ae0" style="background:#c13ae0;margin:0;padding:0;width:100%;">
      <tr>
        <td align="center" style="padding:36px 16px 48px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;">
            <tr>
              <td bgcolor="#5b1ad4" style="background:#5b1ad4;border:4px solid #ffffff;border-radius:28px;box-shadow:0 10px 0 #5a117c;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:22px 24px 8px;">
                      <a href="${home}" style="text-decoration:none;color:#ffffff;">
                        <div style="font-family:${font};font-size:28px;line-height:0.9;letter-spacing:0.03em;color:#ffffff;text-shadow:0 3px 0 #5a117c;">AUX PARTY</div>
                        <div style="font-family:${bodyFont};font-size:10px;letter-spacing:0.28em;font-weight:700;color:#ffffff;opacity:0.9;padding-top:4px;">THE MUSIC QUIZ</div>
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 24px 28px;">
                      <div style="font-family:${bodyFont};font-size:12px;letter-spacing:0.2em;font-weight:700;color:#c6ff3d;padding-bottom:8px;">${attr(opts.kicker)}</div>
                      <h1 style="margin:0 0 10px;font-family:${font};font-size:36px;line-height:0.95;letter-spacing:0.03em;color:#ffffff;">${attr(opts.title)}</h1>
                      <p style="margin:0 0 22px;font-family:${bodyFont};font-size:16px;line-height:1.5;font-weight:600;color:#e9d4ff;">${attr(opts.body)}</p>
                      ${action}
                      ${paste}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 8px 0;font-family:${bodyFont};font-size:12px;line-height:1.5;font-weight:600;color:#ffe9ff;">
                ${attr(opts.footer)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
