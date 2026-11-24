"use client";

/**
 * Rich text for task descriptions. The text is stored as Markdown, not
 * HTML: descriptions written before this editor existed are plain text,
 * which is already valid Markdown, and /api/v1 and the spreadsheet import
 * keep reading and writing a readable string. Nothing the editor emits is
 * ever injected as HTML — Tiptap parses the Markdown into its own schema,
 * which drops raw HTML and refuses `javascript:` links.
 */
import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  Bold,
  Code,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";

export function richTextExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      // Markdown has no underline, so it would not survive a save.
      underline: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    // `breaks` keeps single line breaks in older plain-text descriptions,
    // which would otherwise run together into one paragraph.
    Markdown.configure({ markedOptions: { breaks: true } }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}

/** The editor keeps an empty paragraph at the end so you can always type
 *  below a list; it is not part of the description. */
function toMarkdown(editor: Editor) {
  return editor.getMarkdown().trimEnd();
}

type Props = {
  /** The description as Markdown. */
  value: string;
  editable?: boolean;
  placeholder?: string;
  /** Names the editor for screen readers (the visible label's id). */
  labelledBy?: string;
  /** Or a name of its own, when there is no label element to point at. */
  ariaLabel?: string;
  /** Every change, as Markdown — for forms that submit later. */
  onChange?: (markdown: string) => void;
  /** Focus left the editor and its toolbar after the text was changed —
   *  for fields that save on blur. Not called when nothing was edited, so
   *  merely opening and leaving a description never rewrites it. */
  onCommit?: (markdown: string) => void;
};

export default function RichTextEditor({
  value,
  editable = true,
  placeholder,
  labelledBy,
  ariaLabel,
  onChange,
  onCommit,
}: Props) {
  const dirty = useRef(false);
  const editor = useEditor({
    extensions: richTextExtensions(placeholder),
    content: value,
    contentType: "markdown",
    editable,
    // The page is server-rendered; the editor only exists in the browser.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: editable
          ? "rich-text min-h-20 px-3 py-2 text-sm focus:outline-none"
          : "rich-text text-sm",
        // ProseMirror always marks itself a textbox; a read-only one says so.
        role: "textbox",
        "aria-multiline": "true",
        ...(editable ? {} : { "aria-readonly": "true" }),
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        ...(ariaLabel && !labelledBy ? { "aria-label": ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      dirty.current = true;
      onChange?.(toMarkdown(editor));
    },
  });

  // Follow a new value from outside (another save, a refresh) unless the
  // person is typing in this editor right now.
  useEffect(() => {
    if (!editor || editor.isFocused || dirty.current) return;
    if (toMarkdown(editor) !== value) {
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, value]);

  if (!editable) return <EditorContent editor={editor} />;

  return (
    <div
      className="rounded border border-ink-200 focus-within:ring-2 focus-within:ring-brand-blue"
      onBlur={(e) => {
        // Moving between the toolbar and the text is still "in" the field.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (editor && dirty.current) {
          dirty.current = false;
          onCommit?.(toMarkdown(editor));
        }
      }}
    >
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      heading: e.isActive("heading"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  function editLink() {
    const current = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link address (leave empty to remove)", current ?? "https://");
    if (href === null) return;
    if (href.trim() === "" || href.trim() === "https://") {
      chain().extendMarkRange("link").unsetLink().run();
    } else {
      chain().extendMarkRange("link").setLink({ href: href.trim() }).run();
    }
  }

  const buttons: { label: string; icon: React.ReactNode; active?: boolean; disabled?: boolean; run: () => void }[] = [
    { label: "Bold", icon: <Bold size={14} />, active: s.bold, run: () => chain().toggleBold().run() },
    { label: "Italic", icon: <Italic size={14} />, active: s.italic, run: () => chain().toggleItalic().run() },
    { label: "Strikethrough", icon: <Strikethrough size={14} />, active: s.strike, run: () => chain().toggleStrike().run() },
    { label: "Heading", icon: <Heading size={14} />, active: s.heading, run: () => chain().toggleHeading({ level: 3 }).run() },
    { label: "Bulleted list", icon: <List size={14} />, active: s.bullet, run: () => chain().toggleBulletList().run() },
    { label: "Numbered list", icon: <ListOrdered size={14} />, active: s.ordered, run: () => chain().toggleOrderedList().run() },
    { label: "Quote", icon: <Quote size={14} />, active: s.quote, run: () => chain().toggleBlockquote().run() },
    { label: "Code block", icon: <Code size={14} />, active: s.code, run: () => chain().toggleCodeBlock().run() },
    { label: "Link", icon: <LinkIcon size={14} />, active: s.link, run: editLink },
    { label: "Undo", icon: <Undo2 size={14} />, disabled: !s.canUndo, run: () => chain().undo().run() },
    { label: "Redo", icon: <Redo2 size={14} />, disabled: !s.canRedo, run: () => chain().redo().run() },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-1 border-b border-ink-200 px-2 py-1"
    >
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          aria-label={b.label}
          title={b.label}
          aria-pressed={b.active === undefined ? undefined : b.active}
          disabled={b.disabled}
          // Keep the text selection: a click would otherwise move focus to
          // the button before the command runs.
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.run}
          className={`tap-target rounded p-1.5 text-ink-700 hover:bg-ink-100 disabled:opacity-40 ${
            b.active ? "bg-brand-blueBg text-brand-blueText" : ""
          }`}
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}
