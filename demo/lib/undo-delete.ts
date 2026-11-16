/**
 * Undo for deletes, without changing the server.
 *
 * The item leaves the screen at once, a toast offers Undo, and the DELETE
 * request is only sent once that window has passed. Undo inside the window
 * means nothing was ever sent — the server never has to "un-delete", so the
 * existing delete endpoints, permissions and audit trail are unchanged.
 *
 * The one risk of waiting is the tab closing before the request goes out,
 * which would silently keep something the user meant to delete. So on
 * `pagehide` every pending delete is sent straight away with
 * `keepalive: true`, which lets the request outlive the page.
 */

/** Matches the toast's lifetime for toasts with an action (components/Toast.tsx). */
export const UNDO_WINDOW_MS = 6000;

type CommitResult = { ok: boolean; error?: string };

type Pending = {
  timer: ReturnType<typeof setTimeout>;
  commit: (keepalive: boolean) => Promise<CommitResult>;
  restore: () => void;
  onFailed?: (error: string) => void;
};

const pending = new Map<string, Pending>();
let listening = false;

function flushAll() {
  for (const [key, p] of pending) {
    clearTimeout(p.timer);
    pending.delete(key);
    void p.commit(true);
  }
}

function listenForPageLeave() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("pagehide", flushAll);
}

async function run(key: string, keepalive: boolean) {
  const p = pending.get(key);
  if (!p) return;
  pending.delete(key);
  let result: CommitResult;
  try {
    result = await p.commit(keepalive);
  } catch {
    result = { ok: false, error: "Couldn't reach the server — nothing was deleted." };
  }
  if (!result.ok) {
    // The server said no (or was unreachable): put it back on screen.
    p.restore();
    p.onFailed?.(result.error ?? "Couldn't delete.");
  }
}

/**
 * Send `commit` after the undo window unless `undo()` is called first.
 * The caller has already taken the item off screen; `restore` puts it back
 * (on undo, or if the delete is refused). Scheduling the same `key` again
 * sends the earlier one immediately.
 */
export function scheduleUndoableDelete(
  key: string,
  opts: {
    commit: (keepalive: boolean) => Promise<CommitResult>;
    restore: () => void;
    onFailed?: (error: string) => void;
    delayMs?: number;
  },
): { undo: () => void } {
  listenForPageLeave();
  if (pending.has(key)) void run(key, false);
  const timer = setTimeout(() => void run(key, false), opts.delayMs ?? UNDO_WINDOW_MS);
  pending.set(key, { timer, commit: opts.commit, restore: opts.restore, onFailed: opts.onFailed });
  return {
    undo: () => {
      const p = pending.get(key);
      if (!p) return; // already sent
      clearTimeout(p.timer);
      pending.delete(key);
      p.restore();
    },
  };
}

/** Test/maintenance helper. */
export function __pendingDeletes(): number {
  return pending.size;
}

/** DELETE `url`, mapping a refusal to the server's error message. */
export async function deleteRequest(
  url: string,
  keepalive: boolean,
  fallbackError: string,
): Promise<CommitResult> {
  const res = await fetch(url, { method: "DELETE", keepalive });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, error: body.error ?? fallbackError };
}
