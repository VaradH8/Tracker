import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  isFileSide,
  kindFromName,
  safeFileName,
  storageKeyFor,
} from "@/lib/domain-task-files";

/**
 * Files on a task: where they are written and what they are called.
 *
 * Both halves are attacker-facing. A filename arrives from outside and
 * must never decide a path, and two modules numbering their tasks
 * independently must never write into each other's folders.
 */

describe("where a file lands", () => {
  it("keeps domain tasks out of the tracker's tree", () => {
    // Both modules count tasks from 1. Without the prefix, uploading to
    // domain task 7 could serve files from tracker task 7.
    expect(storageKeyFor(7, "spec.pdf")).toMatch(/^domain\/7\//);
  });

  it("stores under a random name, not the uploaded one", () => {
    // Two people attaching drawing.pdf to one task must not overwrite
    // each other, and a name from outside should never pick the path.
    const a = storageKeyFor(7, "drawing.pdf");
    const b = storageKeyFor(7, "drawing.pdf");
    expect(a).not.toBe(b);
    expect(a).not.toContain("drawing");
  });

  it("keeps the extension, so the file opens on the way back out", () => {
    expect(storageKeyFor(7, "spec.pdf").endsWith(".pdf")).toBe(true);
  });
});

describe("what a file is allowed to be called", () => {
  it("strips a path out of the name", () => {
    // The one that matters: an upload called ../../etc/passwd.
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Windows\\System32\\drivers\\etc\\hosts")).toBe("hosts");
    expect(safeFileName("a/b/c/report.pdf")).toBe("report.pdf");
  });

  it("refuses to produce a dotfile", () => {
    expect(safeFileName(".bashrc").startsWith(".")).toBe(false);
    expect(safeFileName("...")).toBe("file");
  });

  it("never returns nothing", () => {
    // An empty name would write to the directory itself.
    expect(safeFileName("")).toBe("file");
    expect(safeFileName("///")).toBe("file");
  });

  it("keeps the ordinary characters people use", () => {
    expect(safeFileName("Rev C - riser plan (final)[1].pdf")).toBe(
      "Rev C - riser plan (final)[1].pdf",
    );
  });

  it("caps a pathological name rather than blowing the column", () => {
    expect(safeFileName("a".repeat(500)).length).toBeLessThanOrEqual(180);
  });
});

describe("the rest", () => {
  it("labels files by what they are", () => {
    expect(kindFromName("spec.pdf")).toBe("pdf");
    expect(kindFromName("riser.PNG")).toBe("image");
    expect(kindFromName("index.xlsx")).toBe("sheet");
    expect(kindFromName("notes.md")).toBe("doc");
    expect(kindFromName("archive.zip")).toBe("other");
    expect(kindFromName("noextension")).toBe("other");
  });

  it("knows the two sides a file can belong to", () => {
    expect(isFileSide("Brief")).toBe(true);
    expect(isFileSide("Submission")).toBe(true);
    expect(isFileSide("Review")).toBe(false);
    expect(isFileSide(undefined)).toBe(false);
  });

  it("caps uploads well short of a video", () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });
});
