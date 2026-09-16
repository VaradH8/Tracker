import { describe, it, expect } from "vitest";

import {
  includesOverdue,
  normalize,
  parseAsk,
  parseWindow,
  resolvePerson,
  resolveProject,
  windowRange,
  type AskVocabulary,
} from "@/lib/ask/parse";

const VOCAB: AskVocabulary = {
  me: { id: "u-coord", name: "Manasi Kulkarni" },
  people: [
    { id: "u-coord", name: "Manasi Kulkarni" },
    { id: "u-varad", name: "Varad Dawale" },
    { id: "u-varsha", name: "Varsha Patil" },
    { id: "u-asha", name: "Asha Developer" },
  ],
  projects: [
    { id: 1, name: "Acme Portal" },
    { id: 2, name: "Acme Portal Phase 2" },
    { id: 3, name: "Ongoing Projects" },
  ],
};

describe("normalize", () => {
  it("strips possessives and contractions so names survive", () => {
    expect(normalize("What's today's task for Varad?")).toBe(
      "what today task for varad",
    );
    expect(normalize("Varad’s overdue work")).toBe("varad overdue work");
  });

  it("collapses punctuation and whitespace", () => {
    expect(normalize("  who's   BLOCKED?!  ")).toBe("who blocked");
  });
});

describe("parseWindow", () => {
  it("prefers the two-word window over a bare 'week'", () => {
    expect(parseWindow("tasks next week")).toBe("next-week");
    expect(parseWindow("tasks last week")).toBe("last-week");
    expect(parseWindow("tasks this week")).toBe("this-week");
  });

  it("reads single-word windows", () => {
    expect(parseWindow("due today")).toBe("today");
    expect(parseWindow("due tomorrow")).toBe("tomorrow");
    expect(parseWindow("finished yesterday")).toBe("yesterday");
    expect(parseWindow("this month")).toBe("this-month");
  });

  it("falls back to 'any' when no date is mentioned", () => {
    expect(parseWindow("what is varad working on")).toBe("any");
  });
});

describe("windowRange", () => {
  // 2026-05-06 is a Wednesday, so its ISO week runs Mon 04 -> Sun 10.
  const today = "2026-05-06";

  it("bounds single days", () => {
    expect(windowRange("today", today)).toEqual({ from: today, to: today });
    expect(windowRange("tomorrow", today)).toEqual({
      from: "2026-05-07",
      to: "2026-05-07",
    });
    expect(windowRange("yesterday", today)).toEqual({
      from: "2026-05-05",
      to: "2026-05-05",
    });
  });

  it("runs weeks Monday to Sunday", () => {
    expect(windowRange("this-week", today)).toEqual({
      from: "2026-05-04",
      to: "2026-05-10",
    });
    expect(windowRange("next-week", today)).toEqual({
      from: "2026-05-11",
      to: "2026-05-17",
    });
    expect(windowRange("last-week", today)).toEqual({
      from: "2026-04-27",
      to: "2026-05-03",
    });
  });

  it("bounds the calendar month, including a 31-day one", () => {
    expect(windowRange("this-month", today)).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(windowRange("this-month", "2026-02-10")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("leaves 'any' unbounded", () => {
    expect(windowRange("any", today)).toEqual({ from: null, to: null });
  });

  it("only sweeps overdue work into present-tense windows", () => {
    expect(includesOverdue("today")).toBe(true);
    expect(includesOverdue("this-week")).toBe(true);
    expect(includesOverdue("tomorrow")).toBe(false);
    expect(includesOverdue("last-week")).toBe(false);
  });
});

describe("resolvePerson", () => {
  it("matches a first name", () => {
    const { person, isMe } = resolvePerson("tasks for varad", VOCAB);
    expect(person?.id).toBe("u-varad");
    expect(isMe).toBe(false);
  });

  it("matches a full name", () => {
    expect(resolvePerson("what is varsha patil doing", VOCAB).person?.id).toBe(
      "u-varsha",
    );
  });

  it("does not let 'varad' swallow 'varsha' (whole words only)", () => {
    expect(resolvePerson("varsha tasks", VOCAB).person?.id).toBe("u-varsha");
    expect(resolvePerson("varadhan tasks", VOCAB).person).toBeNull();
  });

  it("maps me / my / mine to the asker", () => {
    const r = resolvePerson("what are my tasks", VOCAB);
    expect(r.person?.id).toBe("u-coord");
    expect(r.isMe).toBe(true);
  });

  it("flags isMe when the asker names themselves", () => {
    expect(resolvePerson("manasi tasks today", VOCAB).isMe).toBe(true);
  });

  it("returns null when nobody is named", () => {
    expect(resolvePerson("what is overdue", VOCAB).person).toBeNull();
  });
});

describe("resolveProject", () => {
  it("prefers the longer project name", () => {
    expect(resolveProject("status of acme portal phase 2", VOCAB)?.id).toBe(2);
    expect(resolveProject("status of acme portal", VOCAB)?.id).toBe(1);
  });

  it("returns null for an unknown project", () => {
    expect(resolveProject("status of zeta rollout", VOCAB)).toBeNull();
  });
});

describe("parseAsk", () => {
  it("reads the motivating question: today's tasks for a named person", () => {
    const p = parseAsk("what's today's task for varad", VOCAB);
    expect(p).not.toBeNull();
    expect(p!.topic).toBe("tasks");
    expect(p!.person?.name).toBe("Varad Dawale");
    expect(p!.personIsMe).toBe(false);
    expect(p!.window).toBe("today");
    expect(p!.understood).toBe("Tasks · Varad Dawale · today");
  });

  it.each([
    ["what is varad working on", "tasks"],
    ["show me overdue tasks", "overdue"],
    ["what is overdue on acme portal", "overdue"],
    ["who is overloaded this week", "workload"],
    ["how busy is varad", "workload"],
    ["who is free next week", "workload"],
    ["what is blocked", "blocked"],
    ["which tasks are unassigned", "unassigned"],
    ["who is on leave this week", "leave"],
    ["what did varad finish last week", "completed"],
    ["what is waiting for approval", "approvals"],
    ["who is working on acme portal", "team"],
    ["status of acme portal", "project_status"],
    ["list my projects", "projects"],
    ["help", "help"],
  ])("classifies %j as %s", (question, topic) => {
    expect(parseAsk(question, VOCAB)?.topic).toBe(topic);
  });

  it("treats a bare name-and-date as a task question", () => {
    const p = parseAsk("varad today", VOCAB);
    expect(p?.topic).toBe("tasks");
    expect(p?.window).toBe("today");
  });

  it("re-reads 'how is <person> doing' as workload, not project status", () => {
    const p = parseAsk("how is varad doing", VOCAB);
    expect(p?.topic).toBe("workload");
    expect(p?.person?.id).toBe("u-varad");
  });

  it("keeps 'status of my projects' a project question, not a workload one", () => {
    // "my" resolves a person, but the question is plainly about projects.
    const p = parseAsk("status of my projects", VOCAB);
    expect(p?.topic).toBe("project_status");
  });

  it("keeps 'how is <project> doing' as project status", () => {
    const p = parseAsk("how is acme portal doing", VOCAB);
    expect(p?.topic).toBe("project_status");
    expect(p?.project?.id).toBe(1);
  });

  it("prefers overdue over the generic task reading", () => {
    expect(parseAsk("overdue tasks for varad", VOCAB)?.topic).toBe("overdue");
  });

  it("carries project and person slots together", () => {
    const p = parseAsk("varad's tasks on acme portal this week", VOCAB);
    expect(p?.person?.id).toBe("u-varad");
    expect(p?.project?.id).toBe(1);
    expect(p?.window).toBe("this-week");
  });

  it("returns null rather than guessing at an unparseable question", () => {
    expect(parseAsk("", VOCAB)).toBeNull();
    expect(parseAsk("hello there", VOCAB)).toBeNull();
    expect(parseAsk("what is the weather", VOCAB)).toBeNull();
  });

  it("can only resolve names inside the vocabulary it was given", () => {
    // A Coordinator's vocabulary excludes people outside their projects,
    // so asking about them resolves no person at all.
    const narrow: AskVocabulary = { ...VOCAB, people: [VOCAB.people[0]] };
    expect(parseAsk("tasks for varad today", narrow)?.person).toBeNull();
  });
});
