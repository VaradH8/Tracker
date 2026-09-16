import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  canUseAsk,
  requireUser,
  type SessionUser,
} from "@/lib/server-access";
import { answerAsk, askVocabulary, type AskAnswer } from "@/lib/ask/answer";
import { parseAsk, SUGGESTIONS, type AskVocabulary } from "@/lib/ask/parse";

/** Longest question we'll look at. The parser only reads words it knows;
 *  the cap just stops someone pasting a novel into the box. */
const MAX_QUESTION = 400;

/** Fill `{name}` in the suggestion templates with a real teammate, so the
 *  starter chips read like the asker's own org rather than placeholders. */
function fillSuggestions(vocab: AskVocabulary): string[] {
  const other = vocab.people.find((p) => p.id !== vocab.me.id) ?? vocab.me;
  const first = other.name.split(" ")[0];
  return SUGGESTIONS.map((s) => s.replace(/\{name\}/g, first));
}

/** Ask Tracker is an oversight tool: Admin, Lead and Coordinator only.
 *  Everyone else gets 403 — a Developer asking "what is Varad doing
 *  today" is exactly the cross-team visibility the role gates exist to
 *  prevent. */
function gate(user: SessionUser): NextResponse | null {
  if (!canUseAsk(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Starter chips plus the names this asker may ask about — the client
 *  uses the vocabulary for its inline autocomplete. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const forbidden = gate(user);
  if (forbidden) return forbidden;

  const vocab = await askVocabulary(user);
  return NextResponse.json({
    suggestions: fillSuggestions(vocab),
    people: vocab.people.map((p) => p.name),
    projects: vocab.projects.map((p) => p.name),
  });
}

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const forbidden = gate(user);
  if (forbidden) return forbidden;

  // Free-text endpoint that fans out into several queries per call —
  // throttle per user so a stuck client can't hammer the database.
  const limit = rateLimit(`ask:${user.id}`, 40, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many questions. Try again in ${limit.retryInSec}s.` },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim().slice(0, MAX_QUESTION);
  if (!question) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }

  const vocab = await askVocabulary(user);
  const suggestions = fillSuggestions(vocab);
  const parsed = parseAsk(question, vocab);

  if (!parsed) {
    // Say so plainly rather than guessing — a confident wrong answer about
    // who owes what is worse than "I didn't catch that".
    const answer: AskAnswer = {
      headline: "I didn't catch that one.",
      detail:
        "I answer questions about tasks, overdue work, workload, projects, blockers, leave and sign-offs. Try one of these:",
      suggestions,
    };
    return NextResponse.json({ answer, understood: false });
  }

  const answer = await answerAsk(user, parsed, suggestions);
  return NextResponse.json({ answer, understood: true });
}
