import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound email via SMTP. Configured purely through env vars so the
 * code knows nothing about a specific provider — drop in SES /
 * SendGrid / Postmark / a self-hosted Postfix by setting the right
 * SMTP_* values.
 *
 * If any of SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM is missing,
 * sendEmail() is a structured no-op (logs and returns ok: false). The
 * EmailLog DB row that the caller already writes is still the audit
 * surface, so admins can read /settings/emails and forward the
 * message manually until SMTP is configured.
 */

let cachedTransport: Transporter | null = null;
let cachedTransportConfigured = false;

function getTransport(): Transporter | null {
  if (cachedTransportConfigured) return cachedTransport;
  cachedTransportConfigured = true;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !pass || !from) {
    // Not configured. Stay silent — the caller's EmailLog row is the
    // user-visible artifact in this case.
    return null;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  // Most providers want TLS on 465 (implicit) and STARTTLS on 587
  // (negotiated). Auto-detect from the port; SMTP_SECURE=1 overrides.
  const secure =
    process.env.SMTP_SECURE === "1"
      ? true
      : process.env.SMTP_SECURE === "0"
        ? false
        : port === 465;

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cachedTransport;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, reason: "SMTP not configured." };
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.body,
    });
    return { ok: true };
  } catch (e) {
    // Never throw — the upstream EmailLog row is the source of truth
    // for whether we *tried* to email, and we don't want SMTP outages
    // to break in-app notification flows.
    console.error("sendEmail failed:", e);
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
