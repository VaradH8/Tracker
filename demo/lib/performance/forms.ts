/**
 * The two IBS performance review forms (Monthly / Yearly), as data.
 *
 * Labels here are copied verbatim from the Word templates in
 * templates/ — lib/performance/docx.ts finds rows by these labels, so a
 * wording change in a template must be mirrored here. Plain constants:
 * safe to import from both server and client code.
 */

export type ReviewKind = "Monthly" | "Yearly";
export const REVIEW_KINDS: ReviewKind[] = ["Monthly", "Yearly"];

export function parseKind(v: unknown): ReviewKind | null {
  if (v === "Monthly" || v === "monthly") return "Monthly";
  if (v === "Yearly" || v === "yearly") return "Yearly";
  return null;
}

/** "YYYY-MM" for Monthly, "YYYY" for Yearly. */
export function isValidPeriod(kind: ReviewKind, period: string): boolean {
  const m =
    kind === "Monthly"
      ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period)
      : /^(\d{4})$/.exec(period);
  if (!m) return false;
  const y = Number(m[1]);
  return y >= 2000 && y <= 2100;
}

export type ReviewQuery = { userId: string; kind: ReviewKind; period: string };

/** userId / kind / period from a query string or request body; null if
 *  any is missing or malformed. */
export function parseReviewQuery(v: {
  userId?: unknown;
  kind?: unknown;
  period?: unknown;
}): ReviewQuery | null {
  const kind = parseKind(v.kind);
  const userId = typeof v.userId === "string" ? v.userId : "";
  const period = typeof v.period === "string" ? v.period : "";
  if (!kind || !userId || !isValidPeriod(kind, period)) return null;
  return { userId, kind, period };
}

export type Area = { key: string; label: string };

/** Section 4 rows, in template order. */
export const AREAS: Record<ReviewKind, Area[]> = {
  Monthly: [
    { key: "quality", label: "Quality of Work" },
    { key: "productivity", label: "Productivity / Output" },
    { key: "knowledge", label: "Job Knowledge / Skills" },
    { key: "ownership", label: "Ownership & Initiative" },
    { key: "communication", label: "Communication & Teamwork" },
    { key: "attendance", label: "Attendance & Punctuality" },
    { key: "learning", label: "Learning & Adaptability" },
  ],
  Yearly: [
    { key: "goals", label: "Goal / KPI Achievement" },
    { key: "quality", label: "Quality of Work" },
    { key: "productivity", label: "Productivity / Output" },
    { key: "knowledge", label: "Job Knowledge / Skills" },
    { key: "ownership", label: "Ownership & Accountability" },
    { key: "problemSolving", label: "Problem Solving & Initiative" },
    { key: "communication", label: "Communication & Teamwork" },
    { key: "learning", label: "Learning & Development" },
  ],
};

/** What each section 4 area covers — from the templates' section 10
 *  "What to Evaluate" criteria, grouped under the area they belong to.
 *  Shown to employees rating themselves. */
export const AREA_HINTS: Record<ReviewKind, Record<string, string>> = {
  Monthly: {
    quality: "Accuracy, errors, rework and quality of deliverables.",
    productivity: "Quantity and efficiency of work completed; completing assigned tasks within the month.",
    knowledge: "Application of role-related knowledge and skills.",
    ownership: "Taking responsibility, working independently and meeting deadlines.",
    communication: "Timely updates, effective communication, and coordination and support to team members.",
    attendance: "Regular attendance and adherence to working hours.",
    learning: "Ability to learn and adapt to new tasks; handling day-to-day issues and blockers.",
  },
  Yearly: {
    goals: "Achievement against agreed yearly goals and KPIs.",
    quality: "Consistency and standard of work throughout the year.",
    productivity: "Sustained performance across the review year.",
    knowledge: "Growth and depth of technical or functional expertise.",
    ownership: "Responsibility for deliverables, decisions and outcomes.",
    problemSolving:
      "Ability to solve complex problems and improve processes; improvements, automation or ideas contributed.",
    communication: "Effectiveness with managers, colleagues and stakeholders; mentoring and collaboration.",
    learning: "Skills acquired, training completed and capability growth.",
  },
};

/** Section 8 rating scale, as shown next to the 1–5 pickers. */
export const SCALE: { value: number; label: string }[] = [
  { value: 5, label: "Exceptional" },
  { value: 4, label: "Exceeds Expectations" },
  { value: 3, label: "Meets Expectations" },
  { value: 2, label: "Needs Improvement" },
  { value: 1, label: "Unsatisfactory" },
];

/** Section 5 — Employee Self-Assessment. */
export const SELF_PROMPTS: Record<ReviewKind, Area[]> = {
  Monthly: [
    { key: "achievements", label: "Key achievements this month" },
    { key: "challenges", label: "Challenges / blockers" },
    { key: "support", label: "Support required" },
    { key: "improvement", label: "Areas for improvement" },
    { key: "nextGoals", label: "Goals for next month" },
  ],
  Yearly: [
    { key: "achievements", label: "Major achievements during the year" },
    { key: "projects", label: "Key projects / critical tasks completed" },
    { key: "skills", label: "Skills / knowledge developed" },
    { key: "strengths", label: "Key strengths" },
    { key: "challenges", label: "Challenges faced" },
    { key: "improvement", label: "Areas for improvement" },
    { key: "nextGoals", label: "Goals for next year" },
  ],
};

/** Section 6 — Manager (Overall) Assessment. */
export const MANAGER_PROMPTS: Record<ReviewKind, Area[]> = {
  Monthly: [
    { key: "achievements", label: "Key achievements / contributions" },
    { key: "strengths", label: "Strengths demonstrated" },
    { key: "improvement", label: "Areas for improvement" },
    { key: "training", label: "Training / support required" },
    { key: "nextGoals", label: "Goals / expectations for next month" },
  ],
  Yearly: [
    { key: "contribution", label: "Overall contribution" },
    { key: "consistency", label: "Consistency of performance" },
    { key: "strengths", label: "Key strengths" },
    { key: "development", label: "Development areas" },
    { key: "training", label: "Training / development required" },
    { key: "expectations", label: "Next-year expectations" },
  ],
};

/** Yearly section 3 — Major Achievements & Contributions. */
export const ACHIEVEMENT_ROWS: Area[] = [
  { key: "achievements", label: "Major achievements" },
  { key: "projects", label: "Major projects / critical tasks" },
  { key: "team", label: "Contribution to team / department" },
  { key: "process", label: "Process improvements / initiatives" },
];

/** Section 8 — Rating Scale. Index = rating. */
export const LEVELS = [
  "Exceptional",
  "Exceeds Expectations",
  "Meets Expectations",
  "Needs Improvement",
  "Unsatisfactory",
] as const;
export type Level = (typeof LEVELS)[number];

export function levelFor(rating: number | null): Level | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  return LEVELS[5 - r];
}

export const PRIORITIES = ["Low", "Moderate", "High"] as const;
export type DevPriority = (typeof PRIORITIES)[number];

/** Yearly "Development Priority": the weaker the year, the higher. */
export function priorityFor(rating: number | null): DevPriority | null {
  if (rating == null) return null;
  if (rating >= 4) return "Low";
  if (rating >= 3) return "Moderate";
  return "High";
}

/** Manually-entered yearly goals beyond the tracker KPIs (section 2). */
export const MAX_MANUAL_GOALS = 5;

/**
 * Every key a reviewer may save, as one pattern. Values are strings;
 * ratings are "1"–"5". Anything else is rejected by the API.
 */
export const INPUT_KEY =
  /^(rating\.[A-Za-z]+\.(employee|manager|comments)|self\.[A-Za-z]+|mgr\.[A-Za-z]+|summary\.(overall|level|priority|plan|feedback|employeeComments|commentTo)|milestone\.\d{1,9}|kpi\.[A-Za-z]+\.comments|goal\.[1-5]\.(goal|expected|actual|achievement|comments)|ach\.[A-Za-z]+\.(employee|manager)|reviewDate)$/;

export const MAX_INPUT_LENGTH = 4000;

/** Who an employee's "My Comments" goes to. Stored as
 *  summary.commentTo; used only to route the notification, never printed
 *  on the Word form. */
export const COMMENT_RECIPIENTS = [
  { value: "manager", label: "Reporting Manager" },
  { value: "hr", label: "HR" },
] as const;
export type CommentRecipient = (typeof COMMENT_RECIPIENTS)[number]["value"];

export function isCommentRecipient(v: unknown): v is CommentRecipient {
  return v === "manager" || v === "hr";
}

/** The employee's own fields — what they fill in on My Performance:
 *  their 1–5 self-rating per area, the self-assessment answers, their
 *  summary of the year's achievements and their final comments. */
export const EMPLOYEE_KEY =
  /^(rating\.[A-Za-z]+\.employee|self\.[A-Za-z]+|ach\.[A-Za-z]+\.employee|summary\.(employeeComments|commentTo))$/;

export function isEmployeeKey(key: string): boolean {
  return EMPLOYEE_KEY.test(key);
}

/**
 * Check a save request: `changes` maps field → new value, "" clears it.
 * Returns the trimmed changes, or an error message. `allowed` narrows
 * which keys this caller may touch (the employee only their own).
 */
export function validateChanges(
  changes: Record<string, string>,
  allowed: (key: string) => boolean = () => true,
): { ok: true; changes: Record<string, string> } | { ok: false; error: string } {
  const entries = Object.entries(changes);
  if (entries.length > 300) return { ok: false, error: "Too many fields" };
  const out: Record<string, string> = {};
  for (const [key, raw] of entries) {
    if (!INPUT_KEY.test(key)) return { ok: false, error: `Unknown field: ${key}` };
    if (!allowed(key)) return { ok: false, error: `Not your field to change: ${key}` };
    const value = String(raw).trim();
    if (value.length > MAX_INPUT_LENGTH) return { ok: false, error: `Field too long: ${key}` };
    if (value && isRatingKey(key) && parseRating(value, key === "summary.overall") == null) {
      return { ok: false, error: `Ratings must be 1–5: ${key}` };
    }
    if (value && key === "summary.commentTo" && !isCommentRecipient(value)) {
      return { ok: false, error: "Send your comment to the Reporting Manager or HR." };
    }
    if (value && key === "reviewDate" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { ok: false, error: "Invalid review date" };
    }
    out[key] = value;
  }
  return { ok: true, changes: out };
}

/** Apply changes on top of what's saved — fields nobody touched survive,
 *  so a reviewer and the employee saving around the same time don't wipe
 *  each other's work. */
export function mergeInputs(
  saved: Record<string, string>,
  changes: Record<string, string>,
): Record<string, string> {
  const out = { ...saved };
  for (const [k, v] of Object.entries(changes)) {
    if (v) out[k] = v;
    else delete out[k];
  }
  return out;
}

export function isRatingKey(key: string): boolean {
  return /^rating\.[A-Za-z]+\.(employee|manager)$/.test(key) || key === "summary.overall";
}

/** "3" → 3; anything that isn't 1–5 → null. summary.overall also allows
 *  one decimal ("3.5"). */
export function parseRating(v: string | undefined, decimals = false): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return decimals ? Math.round(n * 10) / 10 : Number.isInteger(n) ? n : null;
}
