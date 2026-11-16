import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  UNDO_WINDOW_MS,
  scheduleUndoableDelete,
  __pendingDeletes,
} from "@/lib/undo-delete";

/** Undo for deleting tasks and projects: nothing reaches the server until
 *  the undo window has passed. */
describe("scheduleUndoableDelete", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the delete once the undo window has passed", async () => {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const restore = vi.fn();
    scheduleUndoableDelete("task:1", { commit, restore });
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(commit).toHaveBeenCalledWith(false);
    expect(restore).not.toHaveBeenCalled();
  });

  it("Undo inside the window sends nothing and puts the item back", async () => {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const restore = vi.fn();
    const { undo } = scheduleUndoableDelete("task:2", { commit, restore });
    undo();
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(__pendingDeletes()).toBe(0);
  });

  it("puts the item back and reports why when the server refuses", async () => {
    const commit = vi.fn().mockResolvedValue({ ok: false, error: "Forbidden" });
    const restore = vi.fn();
    const onFailed = vi.fn();
    scheduleUndoableDelete("project:3", { commit, restore, onFailed });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledWith("Forbidden");
  });

  it("Undo after the delete was sent does nothing", async () => {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const restore = vi.fn();
    const { undo } = scheduleUndoableDelete("task:4", { commit, restore });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    undo();
    expect(restore).not.toHaveBeenCalled();
  });
});
