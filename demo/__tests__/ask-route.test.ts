import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canUseAsk: (r: string) =>
    r === "Admin" || r === "Lead" || r === "Coordinator",
}));

// The answer builder talks to Prisma; the route's job is the gate, the
// parse and the shape of the reply, so stub the data layer out.
vi.mock("@/lib/ask/answer", () => ({
  askVocabulary: vi.fn(),
  answerAsk: vi.fn(),
}));

import { requireUser } from "@/lib/server-access";
import { askVocabulary, answerAsk } from "@/lib/ask/answer";
import { __resetRateLimits } from "@/lib/rate-limit";
import { GET, POST } from "@/app/api/ask/route";
import type { SessionUser } from "@/lib/auth";
import type { AskVocabulary } from "@/lib/ask/parse";

const ROLES: SessionUser["role"][] = [
  "Admin",
  "Lead",
  "Coordinator",
  "BusinessDeveloper",
  "Developer",
];

function actor(role: SessionUser["role"]): SessionUser {
  return {
    id: `u-${role}`,
    email: `${role.toLowerCase()}@example.com`,
    name: `Test ${role}`,
    role,
    isAdmin: role === "Admin",
  };
}

const VOCAB: AskVocabulary = {
  me: { id: "u-Coordinator", name: "Test Coordinator" },
  people: [
    { id: "u-Coordinator", name: "Test Coordinator" },
    { id: "u-varad", name: "Varad Dawale" },
  ],
  projects: [{ id: 1, name: "Acme Portal" }],
};

function askReq(question: unknown) {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
}

beforeEach(() => {
  __resetRateLimits();
  vi.mocked(requireUser).mockReset();
  vi.mocked(askVocabulary).mockReset().mockResolvedValue(VOCAB);
  vi.mocked(answerAsk)
    .mockReset()
    .mockResolvedValue({ headline: "Varad Dawale has 4 tasks due today." });
});

describe("Ask Tracker route — who may ask", () => {
  it("401s an anonymous caller on both verbs", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await GET()).status).toBe(401);

    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await POST(askReq("tasks for varad"))).status).toBe(401);
  });

  it.each(["Developer", "BusinessDeveloper"] as const)(
    "403s a %s — the chat must not become a back door to other people's work",
    async (role) => {
      vi.mocked(requireUser).mockResolvedValue(actor(role));
      const post = await POST(askReq("what are varad's tasks today"));
      expect(post.status).toBe(403);
      // And nothing was even looked up.
      expect(vi.mocked(askVocabulary)).not.toHaveBeenCalled();
      expect(vi.mocked(answerAsk)).not.toHaveBeenCalled();

      vi.mocked(requireUser).mockResolvedValue(actor(role));
      expect((await GET()).status).toBe(403);
    },
  );

  it.each(["Admin", "Lead", "Coordinator"] as const)(
    "lets a %s ask",
    async (role) => {
      vi.mocked(requireUser).mockResolvedValue(actor(role));
      const res = await POST(askReq("what are varad's tasks today"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.understood).toBe(true);
      expect(body.answer.headline).toContain("Varad Dawale");
    },
  );

  it("covers every role exactly once between the allow and deny lists", () => {
    // Guards against a new role being added without a decision here.
    expect(new Set(ROLES).size).toBe(5);
  });
});

describe("Ask Tracker route — behaviour", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
  });

  it("scopes the lookup to the asker, never to the question", async () => {
    await POST(askReq("what are varad's tasks today"));
    expect(vi.mocked(askVocabulary).mock.calls[0][0]).toMatchObject({
      id: "u-Coordinator",
      role: "Coordinator",
    });
    expect(vi.mocked(answerAsk).mock.calls[0][0]).toMatchObject({
      id: "u-Coordinator",
    });
  });

  it("passes the parsed slots through to the answer builder", async () => {
    await POST(askReq("what's today's task for varad"));
    expect(vi.mocked(answerAsk).mock.calls[0][1]).toMatchObject({
      topic: "tasks",
      window: "today",
      person: { id: "u-varad", name: "Varad Dawale" },
    });
  });

  it("400s an empty question", async () => {
    const res = await POST(askReq("   "));
    expect(res.status).toBe(400);
  });

  it("says it didn't understand rather than guessing", async () => {
    const res = await POST(askReq("hello there"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.understood).toBe(false);
    expect(body.answer.suggestions.length).toBeGreaterThan(0);
    // No data was queried for a question we couldn't place.
    expect(vi.mocked(answerAsk)).not.toHaveBeenCalled();
  });

  it("fills the starter chips with a real teammate's name", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.suggestions.some((s: string) => s.includes("Varad"))).toBe(true);
    expect(body.suggestions.every((s: string) => !s.includes("{name}"))).toBe(
      true,
    );
  });

  it("throttles a runaway client", async () => {
    for (let i = 0; i < 40; i++) {
      expect((await POST(askReq("what is overdue"))).status).toBe(200);
    }
    expect((await POST(askReq("what is overdue"))).status).toBe(429);
  });
});
