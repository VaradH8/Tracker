// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { Editor } from "@tiptap/core";
import RichTextEditor, { richTextExtensions } from "@/components/RichTextEditor";

/**
 * Task descriptions are stored as Markdown and shown through Tiptap. These
 * pin what that promises: old plain-text descriptions read the same, the
 * formatting survives a save, nothing in a description can run script, and
 * opening a description without editing it never saves it.
 */

afterEach(cleanup);

function roundTrip(markdown: string) {
  const editor = new Editor({ extensions: richTextExtensions(), content: markdown, contentType: "markdown" });
  const out = { html: editor.getHTML(), markdown: editor.getMarkdown() };
  editor.destroy();
  return out;
}

describe("description Markdown", () => {
  it("keeps the line breaks of an older plain-text description", () => {
    const { html } = roundTrip("Line one\nline two\n\nNext paragraph");
    expect(html).toBe("<p>Line one<br>line two</p><p>Next paragraph</p>");
  });

  it("keeps formatting, lists and links through a save", () => {
    const md = "**bold** *it* ~~gone~~ `code`\n\n- a\n- b\n\n1. x\n2. y\n\n[docs](https://example.com)";
    const { html, markdown } = roundTrip(md);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain('href="https://example.com"');
    expect(markdown).toBe(md);
  });

  it("drops raw HTML and javascript: links instead of rendering them", () => {
    const { html } = roundTrip('<script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    const link = roundTrip("[x](javascript:alert(1)) and [y](https://example.com)").html;
    expect(link).not.toMatch(/href="javascript:/i);
    expect(link).toContain('href="https://example.com"');
  });
});

describe("RichTextEditor", () => {
  async function mount(ui: React.ReactElement) {
    const r = render(ui);
    // The editor is created after the first render (immediatelyRender: false).
    await act(async () => {});
    return r;
  }

  it("does not save a description that was only opened and left", async () => {
    const onCommit = vi.fn();
    await mount(<RichTextEditor value={"Line one\nline two"} onCommit={onCommit} ariaLabel="Description" />);
    const box = screen.getByRole("textbox", { name: "Description" });
    fireEvent.focus(box);
    fireEvent.blur(box);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("is read-only when not editable: no toolbar, not editable", async () => {
    await mount(<RichTextEditor value="**Done** when shipped" editable={false} ariaLabel="Description" />);
    expect(screen.queryByRole("toolbar")).toBeNull();
    const box = screen.getByRole("textbox", { name: "Description" });
    expect(box.getAttribute("contenteditable")).toBe("false");
    expect(box.getAttribute("aria-readonly")).toBe("true");
    expect(screen.getByText("Done").tagName).toBe("STRONG");
  });

  it("passes axe (named textbox, labelled toolbar buttons)", async () => {
    const { container } = await mount(
      <RichTextEditor value="Some *text*" ariaLabel="Description" placeholder="What needs to be done?" />,
    );
    const result = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
    for (const b of screen.getAllByRole("button")) {
      expect(b.getAttribute("aria-label")).toBeTruthy();
      expect(b.className).toContain("tap-target");
    }
  });
});
