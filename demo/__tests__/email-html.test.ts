import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { task: { findUnique: vi.fn() } } }));

import { renderNotificationEmail, formatEmailDate } from "@/lib/email-html";

describe("renderNotificationEmail", () => {
  it("renders heading, task details, and CTA", () => {
    const html = renderNotificationEmail({
      heading: "Assigned to a task",
      task: {
        title: "Fix login redirect",
        project: "Website Revamp",
        priority: "High",
        due: "18 Jul 2026",
        assignedBy: "Varad",
      },
      ctaUrl: "https://tracker.test/notifications",
    });
    expect(html).toContain("Assigned to a task");
    expect(html).toContain("Fix login redirect");
    expect(html).toContain("Website Revamp");
    expect(html).toContain("High");
    expect(html).toContain("18 Jul 2026");
    expect(html).toContain("Varad");
    expect(html).toContain('href="https://tracker.test/notifications"');
    expect(html).toContain("Open in Tracker");
  });

  it("omits rows and CTA that have no value", () => {
    const html = renderNotificationEmail({
      heading: "Leave approved",
      intro: "Your leave on 21 Jul was approved.",
      task: null,
      ctaUrl: null,
    });
    expect(html).toContain("Leave approved");
    expect(html).not.toContain("Assigned by");
    expect(html).not.toContain("Open in Tracker");
  });

  it("escapes user-controlled HTML in titles and intro", () => {
    const html = renderNotificationEmail({
      heading: "Assigned to a task",
      intro: '<img src=x onerror="alert(1)">',
      task: {
        title: "<script>alert(1)</script>",
        project: null,
        priority: null,
        due: null,
        assignedBy: null,
      },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("formatEmailDate", () => {
  it("formats as '18 Jul 2026' and passes null through", () => {
    expect(formatEmailDate(new Date("2026-07-18T00:00:00Z"))).toBe(
      "18 Jul 2026",
    );
    expect(formatEmailDate(null)).toBeNull();
  });
});
