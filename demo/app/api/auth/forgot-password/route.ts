import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/mailer";
import { hashResetToken, newResetToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/** POST { email } — issues a single-use password-reset token. Always
 *  returns 200 even if the email doesn't match an account, so we don't
 *  let a stranger discover which emails are registered.
 *
 *  The token in the link is high-entropy random (not the row's cuid id);
 *  only its SHA-256 is stored, so a leaked DB never yields a usable reset
 *  link. See lib/auth.ts newResetToken/hashResetToken.
 *
 *  No SMTP yet — the reset link is written into EmailLog so an admin
 *  on /settings/emails can read it and forward it to the user out of
 *  band. Once we wire real email, this same EmailLog row turns into
 *  an outbound message and the rest of the flow is unchanged. */
const RESET_TTL_MIN = 60;

// Rate-limit reset requests so the endpoint can't be used to blast a
// victim's inbox or to probe timing. Per-email and per-IP, fixed window.
const RESET_MAX_PER_EMAIL = 3;
const RESET_MAX_PER_IP = 10;
const RESET_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    null;

  const emailGate = email
    ? rateLimit(`reset:em:${email}`, RESET_MAX_PER_EMAIL, RESET_WINDOW_MS)
    : { ok: true, retryInSec: 0 };
  const ipGate = ip
    ? rateLimit(`reset:ip:${ip}`, RESET_MAX_PER_IP, RESET_WINDOW_MS)
    : { ok: true, retryInSec: 0 };

  // Only do the work (and send mail) when we're inside the limits. We
  // still return the same generic 200 either way so a throttled attacker
  // learns nothing.
  if (emailGate.ok && ipGate.ok && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.isActive) {
      const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);
      const rawToken = newResetToken();
      await prisma.passwordResetToken.create({
        data: { id: hashResetToken(rawToken), userId: user.id, expiresAt },
      });
      const origin = new URL(req.url).origin;
      const link = `${origin}/reset-password?token=${rawToken}`;
      const subject = "Reset your Task Manager password";
      const body = `Click the link to choose a new password. It expires in ${RESET_TTL_MIN} minutes.\n\n${link}`;
      // EmailLog row is the audit surface — always written. SMTP is
      // best-effort; if SMTP_* env vars aren't set, sendEmail is a
      // no-op and the admin can still forward the link from
      // /settings/emails.
      await prisma.emailLog.create({
        data: {
          recipientId: user.id,
          toEmail: user.email,
          subject,
          body,
          kind: "password_reset",
        },
      });
      void sendEmail({ to: user.email, subject, body });
    }
  }

  // Always 200 + generic copy — don't reveal whether an account exists.
  return NextResponse.json({
    ok: true,
    message:
      "If that email matches an account, a reset link is on its way. Check the admin email log if you don't see it.",
  });
}
