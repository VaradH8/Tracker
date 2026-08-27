/**
 * Files on a domain task: where they go and what they are called.
 *
 * The bytes live on disk under UPLOAD_DIR, exactly as the tracker's
 * attachments do, so both modules share one Docker volume and one backup
 * story. Only the path is kept in the database.
 *
 * Domain tasks get their own subtree — `domain/<taskId>/` — because the
 * two modules number their tasks independently and task 7 in one is not
 * task 7 in the other. Without the prefix, uploading to one could serve
 * files from the other.
 */

import { randomBytes } from "node:crypto";
import { extname } from "node:path";

/**
 * Generous for a spec, a screenshot or a marked-up drawing, and far short
 * of an invitation to park a video here.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const UPLOAD_ROOT = process.env.UPLOAD_DIR || "/uploads";

/** Which side of the conversation a file belongs to. */
export const FILE_SIDES = ["Brief", "Submission"] as const;
export type FileSide = (typeof FILE_SIDES)[number];

export function isFileSide(v: unknown): v is FileSide {
  return (FILE_SIDES as readonly string[]).includes(v as string);
}

export function kindFromName(
  name: string,
): "pdf" | "image" | "doc" | "sheet" | "other" {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["doc", "docx", "odt", "rtf", "txt", "md"].includes(ext)) return "doc";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "sheet";
  return "other";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * A filename safe to write and safe to hand back.
 *
 * Anything with a slash or a dot-dot in it is a path, not a name — an
 * upload called `../../etc/passwd` would otherwise be written wherever it
 * pleased. Only the last segment survives, and the result is capped so a
 * pathological name cannot blow the column.
 */
export function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w. \-()[\]]/g, "_").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 180);
}

/**
 * Where one upload lands, relative to UPLOAD_ROOT.
 *
 * The stored name is random rather than the uploaded one: two people
 * attaching `drawing.pdf` to the same task must not overwrite each other,
 * and a name that came from outside should never decide a path. The real
 * name is kept in the database for display.
 */
export function storageKeyFor(taskId: number, name: string): string {
  const stored = `${randomBytes(8).toString("hex")}${extname(name) || ""}`;
  return `domain/${taskId}/${stored}`;
}
