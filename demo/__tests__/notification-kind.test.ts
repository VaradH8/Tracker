import { describe, it, expect } from "vitest";
import { serializeNotification } from "@/lib/serializers";

function row(kind: string) {
  return {
    id: 1,
    userId: "u-1",
    user: { name: "Varad Hadawale" },
    kind,
    title: "Leave request",
    body: "Casual leave, 22–23 Sept",
    taskId: null,
    isRead: false,
    createdAt: new Date(),
  };
}

describe("serializeNotification — kind", () => {
  it('reads legacy "leave" rows back as "leave_requested"', () => {
    // Written by the leave route before the kind was renamed; left as-is in
    // the database. Unmapped, the bell rendered an undefined icon and crashed.
    expect(serializeNotification(row("leave")).kind).toBe("leave_requested");
  });

  it.each([
    "assigned",
    "mention",
    "blocked",
    "leave_requested",
    "leave_approved",
    "leave_denied",
  ])("passes %s through unchanged", (kind) => {
    expect(serializeNotification(row(kind)).kind).toBe(kind);
  });

  it("passes an unknown kind through for the UI fallback to handle", () => {
    expect(serializeNotification(row("something_new")).kind).toBe(
      "something_new",
    );
  });
});
