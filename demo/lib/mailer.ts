import nodemailer, { type Transporter } from "nodemailer";
import { getSettings } from "./settings";

/**
 * Outbound email via SMTP. The transport (host/user/pass) comes from env
 * vars; the From address is whatever an admin sets on the Settings page
 * (AppSettings.smtpFrom), falling back to the SMTP_FROM env var.
 *
 * If host/user/pass aren't set, or there's no From address from either
 * source, sendEmail() is a structured no-op. The EmailLog DB row the
 * caller already writes is still the audit surface, so admins can read
 * /settings/emails and forward the message manually until SMTP is set.
 */

let cachedTransport: Transporter | null = null;
let cachedTransportConfigured = false;

/** The From address: admin-configured value wins, else the env var. */
async function resolveFrom(): Promise<string | null> {
  try {
    const s = await getSettings();
    if (s.smtpFrom && s.smtpFrom.trim()) return s.smtpFrom.trim();
  } catch {
    /* DB unavailable — fall back to env */
  }
  return process.env.SMTP_FROM ?? null;
}

function getTransport(): Transporter | null {
  if (cachedTransportConfigured) return cachedTransport;
  cachedTransportConfigured = true;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
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
  const from = await resolveFrom();
  if (!from) {
    return { ok: false, reason: "No From address configured." };
  }
  try {
    await transport.sendMail({
      from,
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
