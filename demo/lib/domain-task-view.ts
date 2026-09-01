/**
 * Which attachments may be shown in the browser, and how.
 *
 * Split out of domain-task-files because both the download route and the
 * card need these answers, and the card is a client component: importing
 * them from that module dragged `node:crypto` and `node:path` into the
 * browser bundle and the build failed outright. Nothing here touches the
 * filesystem — it is string reasoning about a filename, so it is safe on
 * both sides.
 */

/**
 * A deliberate allowlist, not a guess from the extension.
 *
 * Serving an uploaded file inline means the browser renders it inside the
 * app's own origin, so anything that can carry script becomes stored XSS
 * against whoever opens it — and "it's only a task attachment" is exactly
 * the reasoning that ends with a stolen session cookie.
 *
 * SVG is NOT here, and that is the whole point of an allowlist. It is an
 * image everywhere else in this codebase, and it is also a document that
 * can carry <script>. It downloads.
 *
 * PDFs render in the browser's own sandboxed viewer, which is why they
 * qualify where HTML never will.
 */
const INLINE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  pdf: "application/pdf",
};

/** The type to serve a file as when showing it, or null to force a save. */
export function inlineContentType(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return INLINE_TYPES[ext] ?? null;
}

/** Whether the UI should offer View / open-in-a-tab for this file. */
export function isViewable(name: string): boolean {
  return inlineContentType(name) !== null;
}

/** Images go straight in an <img>; a PDF needs a frame. */
export function isImageName(name: string): boolean {
  const t = inlineContentType(name);
  return !!t && t.startsWith("image/");
}
