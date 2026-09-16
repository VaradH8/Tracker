/**
 * Ask Tracker — the question parser.
 *
 * Deliberately deterministic: no LLM, no network call, nothing leaves the
 * server. A question is reduced to a `topic` plus a few slots (person,
 * project, time window), and `lib/ask/answer.ts` turns that into scoped
 * Prisma queries. The trade-off is honest and visible in the UI — we only
 * answer the question shapes listed in SUGGESTIONS, and anything we can't
 * place comes back as "I didn't catch that" with examples rather than a
 * confident guess.
 *
 * Everything here is pure so it can be unit-tested without a database.
 */

export type AskTopic =
  | "help"
  | "tasks"
  | "overdue"
  | "workload"
  | "project_status"
  | "unassigned"
  | "blocked"
  | "leave"
  | "completed"
  | "projects"
  | "team"
  | "approvals";

export type WindowKind =
  | "today"
  | "tomorrow"
  | "yesterday"
  | "this-week"
  | "next-week"
  | "last-week"
  | "this-month"
  | "any";

export type PersonRef = { id: string; name: string };
export type ProjectRef = { id: number; name: string };

/** The names the parser is allowed to resolve against — built per request
 *  from what the *asker* can already see, so the parser can never name a
 *  person or project outside their scope. */
export type AskVocabulary = {
  me: PersonRef;
  people: PersonRef[];
  projects: ProjectRef[];
};

export type ParsedAsk = {
  topic: AskTopic;
  person: PersonRef | null;
  /** The question said "me" / "my" rather than naming someone. Changes
   *  phrasing ("You have 4 tasks" vs "Varad has 4 tasks"). */
  personIsMe: boolean;
  project: ProjectRef | null;
  window: WindowKind;
  /** Slots we filled, rendered under the answer so the asker can see how
   *  their wording was read and correct it if we got it wrong. */
  understood: string;
};

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/** Lowercase, drop possessives and contractions ("varad's" -> "varad",
 *  "what's" -> "what"), and reduce everything else to single-spaced words
 *  so the matchers below can rely on plain word boundaries. */
export function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^a-z0-9\s.@-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Time windows                                                        */
/* ------------------------------------------------------------------ */

/** Ordered: the two-word windows come first so "next week" is never read
 *  as a bare "week". */
const WINDOW_PATTERNS: [RegExp, WindowKind][] = [
  [/\b(next week|coming week|upcoming week)\b/, "next-week"],
  [/\b(last week|previous week|past week)\b/, "last-week"],
  [/\b(this week|current week|the week)\b/, "this-week"],
  [/\b(this month|current month)\b/, "this-month"],
  [/\b(today|todays|for the day)\b/, "today"],
  [/\b(tomorrow|tomorrows|next day)\b/, "tomorrow"],
  [/\b(yesterday|yesterdays)\b/, "yesterday"],
];

export function parseWindow(text: string): WindowKind {
  for (const [re, kind] of WINDOW_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return "any";
}

export const WINDOW_LABELS: Record<WindowKind, string> = {
  today: "today",
  tomorrow: "tomorrow",
  yesterday: "yesterday",
  "this-week": "this week",
  "next-week": "next week",
  "last-week": "last week",
  "this-month": "this month",
  any: "any time",
};

export type DateRange = { from: string | null; to: string | null };

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing `iso`. Weeks run Monday to Sunday,
 *  matching weekNumberOf() in lib/mock.ts. */
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dayNr = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dayNr);
}

/** Concrete YYYY-MM-DD bounds for a window, inclusive at both ends.
 *  `today` is passed in rather than read from the clock so callers and
 *  tests agree on what "today" means. */
export function windowRange(w: WindowKind, today: string): DateRange {
  switch (w) {
    case "today":
      return { from: today, to: today };
    case "tomorrow":
      return { from: addDays(today, 1), to: addDays(today, 1) };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "this-week": {
      const mon = mondayOf(today);
      return { from: mon, to: addDays(mon, 6) };
    }
    case "next-week": {
      const mon = addDays(mondayOf(today), 7);
      return { from: mon, to: addDays(mon, 6) };
    }
    case "last-week": {
      const mon = addDays(mondayOf(today), -7);
      return { from: mon, to: addDays(mon, 6) };
    }
    case "this-month": {
      const d = new Date(today + "T00:00:00Z");
      const first = today.slice(0, 7) + "-01";
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
      return { from: first, to: last };
    }
    case "any":
      return { from: null, to: null };
  }
}

/**
 * Whether a window should sweep in still-open work whose deadline has
 * already passed. An overdue task is part of *today's* plate — leaving it
 * out would answer "what is on Varad's plate today" with a list that hides
 * the three things he is already late on. Retrospective and forward-looking
 * windows stay strictly bounded.
 */
export function includesOverdue(w: WindowKind): boolean {
  return w === "today" || w === "this-week";
}

/* ------------------------------------------------------------------ */
/* Slot resolution                                                     */
/* ------------------------------------------------------------------ */

/** Whole-word containment test that tolerates multi-word needles. */
function containsPhrase(text: string, phrase: string): boolean {
  const p = normalize(phrase);
  if (!p) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|\\s)" + escaped + "(\\s|$)").test(text);
}

const ME_RE = /\b(me|my|mine|i|myself)\b/;

/** Resolve a person from the question. A named match wins over "me"/"my",
 *  and we try full names before first names — longest key first — so
 *  "Varad Dawale" beats a colleague who merely shares a first name. */
export function resolvePerson(
  text: string,
  vocab: AskVocabulary,
): { person: PersonRef | null; isMe: boolean } {
  const candidates: { key: string; person: PersonRef }[] = [];
  for (const p of vocab.people) {
    candidates.push({ key: p.name, person: p });
    const first = p.name.trim().split(/\s+/)[0];
    if (first && first !== p.name) candidates.push({ key: first, person: p });
  }
  candidates.sort((a, b) => b.key.length - a.key.length);

  for (const c of candidates) {
    if (containsPhrase(text, c.key)) {
      return { person: c.person, isMe: c.person.id === vocab.me.id };
    }
  }
  if (ME_RE.test(text)) return { person: vocab.me, isMe: true };
  return { person: null, isMe: false };
}

/** Resolve a project by name. Longest name first so "Acme Portal Phase 2"
 *  is not swallowed by "Acme Portal". */
export function resolveProject(
  text: string,
  vocab: AskVocabulary,
): ProjectRef | null {
  const sorted = [...vocab.projects].sort(
    (a, b) => b.name.length - a.name.length,
  );
  for (const p of sorted) {
    if (containsPhrase(text, p.name)) return p;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Topic classification                                                */
/* ------------------------------------------------------------------ */

/** Ordered — first match wins. The order encodes precedence: "overdue
 *  tasks" is an overdue question, not a generic task question. */
const TOPIC_PATTERNS: [RegExp, AskTopic][] = [
  [
    /^(help|what can you|what can i ask|how do i use|commands?|examples?)\b/,
    "help",
  ],
  [/\b(approv\w*|sign ?off|signoff|awaiting sign|needs? sign)\b/, "approvals"],
  [
    /\b(on leave|leaves?|holiday|vacation|out of office|ooo|time off|day off)\b/,
    "leave",
  ],
  [
    /\b(unassigned|unallocated|no assignee|not assigned|nobody assigned|without an owner)\b/,
    "unassigned",
  ],
  [/\b(blocked|blocker|blockers|stuck|dependenc\w*)\b/, "blocked"],
  [
    /\b(overdue|late|past due|behind schedule|slipping|delayed|missed the deadline|missed deadline)\b/,
    "overdue",
  ],
  [
    /\b(complet\w*|finish\w*|delivered|shipped|closed|done|wrapped up)\b/,
    "completed",
  ],
  [
    /\b(workload|work load|capacity|overloaded|overload|busy|bandwidth|utilisation|utilization|availability|available|free|spare)\b/,
    "workload",
  ],
  [
    /\b(who (is|are) (on|in|working on)|team (on|for|of)|members?|roster)\b/,
    "team",
  ],
  [/\b(status|health|progress|update on|how is|how are|how s)\b/, "project_status"],
  [/\bprojects?\b/, "projects"],
  [
    /\b(tasks?|to ?do|todos?|work|working on|due|assigned|doing|plan|agenda|priorit\w*|pending|open items?)\b/,
    "tasks",
  ],
];

function classify(text: string): AskTopic | null {
  for (const [re, topic] of TOPIC_PATTERNS) {
    if (re.test(text)) return topic;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/** Parse a question into a topic + slots, or `null` when nothing in the
 *  catalogue fits. `null` is a feature: the UI shows suggestions instead
 *  of inventing an answer. */
export function parseAsk(raw: string, vocab: AskVocabulary): ParsedAsk | null {
  const text = normalize(raw);
  if (!text) return null;

  const { person, isMe } = resolvePerson(text, vocab);
  const project = resolveProject(text, vocab);
  const window = parseWindow(text);

  let topic = classify(text);
  if (topic === null) {
    // No topic word, but a name, a project or a date landed — "varad
    // today", "Acme Portal" — which is almost always a task question.
    if (person || project || window !== "any") topic = "tasks";
    else return null;
  }

  // "status" is a project word, but "how is varad doing" is really a
  // workload question. Only re-read it that way when a person is named,
  // no specific project matched, and the question never says "project" —
  // otherwise "status of my projects" would answer about the asker.
  if (
    topic === "project_status" &&
    !project &&
    person &&
    !/\bprojects?\b/.test(text)
  ) {
    topic = "workload";
  }

  return {
    topic,
    person,
    personIsMe: isMe,
    project,
    window,
    understood: describe(topic, person, isMe, project, window),
  };
}

const TOPIC_LABELS: Record<AskTopic, string> = {
  help: "Help",
  tasks: "Tasks",
  overdue: "Overdue",
  workload: "Workload",
  project_status: "Project status",
  unassigned: "Unassigned",
  blocked: "Blocked",
  leave: "Leave",
  completed: "Completed",
  projects: "Projects",
  team: "Team",
  approvals: "Awaiting approval",
};

function describe(
  topic: AskTopic,
  person: PersonRef | null,
  isMe: boolean,
  project: ProjectRef | null,
  window: WindowKind,
): string {
  const parts = [TOPIC_LABELS[topic]];
  if (person) parts.push(isMe ? "you" : person.name);
  if (project) parts.push(project.name);
  if (window !== "any") parts.push(WINDOW_LABELS[window]);
  return parts.join(" · ");
}

/** Starter chips on an empty chat, and the fallback list when a question
 *  does not parse. `{name}` is filled in by the route with a real
 *  teammate's name so the examples are about the asker's own team. */
export const SUGGESTIONS = [
  "What are {name}'s tasks today?",
  "What's overdue?",
  "Who's overloaded this week?",
  "What's blocked?",
  "Which tasks are unassigned?",
  "Who's on leave this week?",
  "What did {name} finish last week?",
  "What's waiting for approval?",
  "Status of my projects",
  "What are my tasks this week?",
];
