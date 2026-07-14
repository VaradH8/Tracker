import { prisma } from "./db";

/**
 * HTML rendering for outbound email. Email clients don't load external
 * CSS or web fonts, so everything is inline styles on nested tables —
 * ugly to read, but it's the only markup that renders consistently in
 * Gmail/Outlook. The plain-text `body` the caller already passes to
 * sendEmail() stays as the text/plain fallback; EmailLog is unchanged.
 */

export type TaskEmailDetails = {
  title: string;
  project: string | null;
  priority: string | null;
  due: string | null;
  assignedBy: string | null;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "18 Jul 2026" — compact, unambiguous across locales. */
export function formatEmailDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Pull the fields worth putting in an email for one task. Returns null
 *  if the task is gone (deleted between notify and send — just fall back
 *  to the plain shell). `assignedBy` prefers the acting user's name and
 *  falls back to the Person Responsible on the task. */
export async function taskEmailDetails(
  taskId: number,
  actorName?: string | null,
): Promise<TaskEmailDetails | null> {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      priority: true,
      targetDate: true,
      project: { select: { name: true } },
      responsible: { select: { name: true } },
    },
  });
  if (!t) return null;
  return {
    title: t.title,
    project: t.project?.name ?? null,
    priority: t.priority ?? null,
    due: formatEmailDate(t.targetDate),
    assignedBy: actorName ?? t.responsible?.name ?? null,
  };
}

// Matches the app's Google-palette pills (brand-redBg, yellowBg, greenBg).
const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  High: { bg: "#fce8e6", fg: "#c5221f" },
  Medium: { bg: "#fef7e0", fg: "#b06000" },
  Low: { bg: "#e6f4ea", fg: "#137333" },
};

function detailRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:5px 16px 5px 0;font-size:11px;font-weight:600;color:#5f6368;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;vertical-align:middle;">${label}</td>
    <td style="padding:5px 0;font-size:14px;color:#202124;vertical-align:middle;">${valueHtml}</td>
  </tr>`;
}

/** One branded shell for every outbound message: heading, optional free
 *  text, optional task-details card, optional CTA button. Anything not
 *  provided is simply omitted — no empty boxes. */
export function renderNotificationEmail(opts: {
  heading: string;
  intro?: string | null;
  task?: TaskEmailDetails | null;
  ctaUrl?: string | null;
  ctaLabel?: string;
}): string {
  const parts: string[] = [];

  parts.push(
    `<h1 style="margin:0 0 12px;font-size:18px;line-height:1.35;font-weight:700;color:#202124;">${esc(opts.heading)}</h1>`,
  );

  if (opts.intro && opts.intro.trim()) {
    parts.push(
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3c4043;">${esc(opts.intro.trim())}</p>`,
    );
  }

  const t = opts.task;
  if (t) {
    const rows: string[] = [];
    if (t.project) rows.push(detailRow("Project", esc(t.project)));
    if (t.priority) {
      const c = PRIORITY_COLORS[t.priority] ?? { bg: "#f1f3f4", fg: "#5f6368" };
      rows.push(
        detailRow(
          "Priority",
          `<span style="display:inline-block;background:${c.bg};color:${c.fg};border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;">${esc(t.priority)}</span>`,
        ),
      );
    }
    if (t.due) rows.push(detailRow("Due date", esc(t.due)));
    if (t.assignedBy) rows.push(detailRow("Assigned by", esc(t.assignedBy)));

    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border:1px solid #e8eaed;border-radius:8px;margin:0 0 20px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:15px;font-weight:600;line-height:1.4;color:#202124;margin-bottom:${rows.length ? "10px" : "0"};word-break:break-word;">${esc(t.title)}</div>
          ${rows.length ? `<table role="presentation" cellpadding="0" cellspacing="0">${rows.join("")}</table>` : ""}
        </td></tr>
      </table>`,
    );
  }

  if (opts.ctaUrl) {
    parts.push(
      `<a href="${esc(opts.ctaUrl)}" style="display:inline-block;background:#1a73e8;color:#ffffff;border-radius:6px;padding:10px 22px;font-size:14px;font-weight:600;text-decoration:none;">${esc(opts.ctaLabel ?? "Open in Tracker")}</a>`,
    );
  }

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f3f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f4;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:540px;background:#ffffff;border:1px solid #dadce0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1a73e8;padding:14px 24px;">
          <span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.3px;">Tracker</span>
        </td></tr>
        <tr><td style="padding:24px;">
          ${parts.join("\n")}
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #e8eaed;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#80868b;">You're receiving this because of activity on a project you're part of in Tracker.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
