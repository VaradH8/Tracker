/**
 * Writes a performance Report into the official IBS Word template
 * (templates/monthly-performance-review.docx / yearly-…), so the download
 * is the same document HR already uses — same layout, fonts, branding,
 * rating scale and criteria pages — with the blanks filled in.
 *
 * The templates are plain tables (no nesting, no merged cells), so this
 * edits word/document.xml directly: find a table by position, a row by
 * its first-cell label, and replace a cell's paragraphs with new text in
 * the cell's own formatting. Data tables (tasks, KPIs) grow by cloning
 * the template's first blank row. The whole document is then set in
 * Poppins, which is embedded in the file (see applyDocFont). Server-only.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { fmtDay } from "@/lib/engagement";
import { LEVELS, PRIORITIES, type ReviewKind } from "./forms";
import { textOf, type Report } from "./report";

const TEMPLATE: Record<ReviewKind, string> = {
  Monthly: "monthly-performance-review.docx",
  Yearly: "yearly-performance-review.docx",
};

/** Table positions in both templates. */
const T = {
  details: 0,
  goals: 1,
  /** Monthly: long-term progress. Yearly: achievements. */
  second: 2,
  assessment: 3,
  self: 4,
  manager: 5,
  summary: 6,
  signoff: 8,
} as const;
const TABLE_COUNT = 10;

/* ------------------------------------------------------------ xml bits */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const TABLE_RE = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
const ROW_RE = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
const CELL_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;

/** Visible text of a fragment (a cell or row). */
export function textIn(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => unesc(m[1])).join("");
}

/** Replace a cell's paragraphs with `lines`, keeping the cell properties,
 *  the first paragraph's properties and the first run's formatting (or
 *  the paragraph-mark formatting for an empty cell). */
export function setCellText(cell: string, lines: string | string[]): string {
  const arr = (Array.isArray(lines) ? lines : String(lines).split(/\r?\n/)).map((l) => l ?? "");
  const tcPr = /<w:tcPr>[\s\S]*?<\/w:tcPr>/.exec(cell)?.[0] ?? "";
  const para = /<w:p[ >][\s\S]*?<\/w:p>/.exec(cell)?.[0] ?? "";
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(para)?.[0] ?? "";
  const run = /<w:r[ >][\s\S]*?<\/w:r>/.exec(para)?.[0] ?? "";
  const rPr =
    /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run)?.[0] ??
    /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(pPr)?.[0] ??
    "";
  const paras = (arr.length ? arr : [""]).map((line) =>
    line
      ? `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`
      : `<w:p>${pPr}</w:p>`,
  );
  return `<w:tc>${tcPr}${paras.join("")}</w:tc>`;
}

function cellsOf(row: string): string[] {
  return row.match(CELL_RE) ?? [];
}

/** Rewrite the given cells of a row (index → text). */
function fillRow(row: string, values: Record<number, string | string[]>): string {
  let i = -1;
  return row.replace(CELL_RE, (cell) => {
    i += 1;
    return i in values ? setCellText(cell, values[i]) : cell;
  });
}

/** Cloned rows must not repeat Word's paragraph ids. */
const stripIds = (xml: string) => xml.replace(/\s+w14:(paraId|textId)="[^"]*"/g, "");

class Doc {
  private tables: string[];
  constructor(private xml: string) {
    this.tables = xml.match(TABLE_RE) ?? [];
    if (this.tables.length !== TABLE_COUNT) {
      throw new Error(`Unexpected template: ${this.tables.length} tables, expected ${TABLE_COUNT}`);
    }
  }

  private rows(t: number): string[] {
    return this.tables[t].match(ROW_RE) ?? [];
  }

  private setRows(t: number, rows: string[]) {
    const old = this.rows(t);
    const first = this.tables[t].indexOf(old[0]);
    const lastRow = old[old.length - 1];
    const end = this.tables[t].lastIndexOf(lastRow) + lastRow.length;
    this.tables[t] = this.tables[t].slice(0, first) + rows.join("") + this.tables[t].slice(end);
  }

  /** Fill the cell right of each matching label (label/value pairs). */
  labelled(t: number, values: Record<string, string>) {
    const rows = this.rows(t).map((row) => {
      const cells = cellsOf(row);
      const fill: Record<number, string> = {};
      cells.forEach((c, i) => {
        const label = textIn(c).trim();
        if (label in values && i + 1 < cells.length) fill[i + 1] = values[label];
      });
      return Object.keys(fill).length ? fillRow(row, fill) : row;
    });
    this.setRows(t, rows);
  }

  /** Fill the row whose first cell reads `label`. */
  byLabel(t: number, label: string, values: Record<number, string | string[]>) {
    let hit = false;
    const rows = this.rows(t).map((row) => {
      if (hit || textIn(cellsOf(row)[0] ?? "").trim() !== label) return row;
      hit = true;
      return fillRow(row, values);
    });
    if (!hit) throw new Error(`Template row not found: "${label}"`);
    this.setRows(t, rows);
  }

  /** Replace the data rows (everything after the header) with one row
   *  per entry, cloned from the first data row. Keeps one blank row
   *  when there's nothing to show. */
  data(t: number, entries: (string | string[])[][]) {
    const [header, proto] = this.rows(t);
    const blank = fillRow(proto, Object.fromEntries(cellsOf(proto).map((_, i) => [i, ""])));
    const rows = entries.length
      ? entries.map((vals) => stripIds(fillRow(proto, Object.fromEntries(vals.map((v, i) => [i, v])))))
      : [stripIds(blank)];
    this.setRows(t, [header, ...rows]);
  }

  toString(): string {
    let i = 0;
    return this.xml.replace(TABLE_RE, () => this.tables[i++]);
  }
}

/* ------------------------------------------------------------ filling */

const checks = (options: readonly string[], picked: string | null) =>
  options.map((o) => `${o === picked ? "☒" : "☐"} ${o}`).join("  ");

const pctCell = (v: number | null) => (v == null ? "—" : `${v}%`);
const ratingCell = (v: number | null) => (v == null ? "" : String(v));

export type SignOff = { hrName?: string | null };

export function fillDocument(xml: string, r: Report, signOff: SignOff = {}): string {
  const doc = new Doc(xml);
  const e = r.employee;
  const range = `${fmtDay(r.from)} – ${fmtDay(r.to)}`;

  /* 1. Employee details */
  doc.labelled(T.details, {
    "Employee Name": e.name,
    "Employee ID": e.employeeCode,
    Department: e.department,
    Designation: e.designation,
    "Reporting Manager": e.reportingManager,
    "Review Period": range,
    ...(r.kind === "Monthly"
      ? { "Review Month": r.periodLabel, "Date of Review": fmtDay(r.reviewDate) }
      : { "Review Year": r.periodLabel, "Date of Joining": e.joined ? fmtDay(e.joined) : "" }),
  });

  if (r.kind === "Monthly") {
    /* 2. Monthly goals / assigned tasks */
    doc.data(
      T.goals,
      r.goals.map((g) => [
        `${g.title} (${g.project})`,
        g.expected,
        g.priority,
        g.targetDate ? fmtDay(g.targetDate) : "—",
        g.status,
      ]),
    );
    /* 3. Critical / long-term progress */
    doc.data(
      T.second,
      r.longTerm.map((l) => [
        `${l.title} (${l.project})`,
        textOf(l.milestone),
        pctCell(l.planned),
        pctCell(l.actual),
        l.status,
      ]),
    );
  } else {
    /* 2. Annual goals / KPIs */
    doc.data(
      T.goals,
      r.kpis.map((k) => [k.goal, k.expected, k.actual, pctCell(k.achievement), textOf(k.comments)]),
    );
    /* 3. Major achievements & contributions */
    for (const a of r.achievements) {
      doc.byLabel(T.second, a.label, { 1: textOf(a.employee), 2: textOf(a.manager) });
    }
  }

  /* 4. Performance assessment */
  for (const a of r.areas) {
    doc.byLabel(T.assessment, a.label, {
      1: ratingCell(a.employee),
      2: ratingCell(a.effective),
      3: a.comments || a.evidence,
    });
  }

  /* 5. Self-assessment / 6. Manager assessment */
  for (const s of r.self) doc.byLabel(T.self, s.label, { 1: textOf(s) });
  for (const m of r.manager) doc.byLabel(T.manager, m.label, { 1: textOf(m) });

  /* 7. Summary */
  const s = r.summary;
  doc.byLabel(T.summary, r.kind === "Monthly" ? "Overall Monthly Rating" : "Overall Annual Rating", {
    1: `${s.overall == null ? "____" : s.overall.toFixed(1)} / 5`,
  });
  doc.byLabel(T.summary, "Performance Level", { 1: checks(LEVELS, s.level) });
  if (r.kind === "Yearly") {
    doc.byLabel(T.summary, "Development Priority", { 1: checks(PRIORITIES, s.priority) });
  }
  doc.byLabel(T.summary, s.plan.label, { 1: textOf(s.plan) });
  doc.byLabel(T.summary, s.feedback.label, { 1: textOf(s.feedback) });
  doc.byLabel(T.summary, s.employeeComments.label, { 1: textOf(s.employeeComments) });

  /* 9. Sign-off — names filled; signatures and dates stay for ink. */
  const sign = (name: string) => [`Name: ${name}`, "Signature:", "Date:"];
  doc.data(T.signoff, [[sign(e.name), sign(e.reportingManager), sign(signOff.hrName ?? "")]]);

  return doc.toString();
}

/* --------------------------------------------------------------- font */

/** The house font (the app's body font). Every run in the download is
 *  set in it, and it's embedded so the document looks the same on a PC
 *  that doesn't have Poppins installed. Poppins is SIL OFL 1.1, which
 *  permits embedding — templates/fonts/OFL.txt. */
export const DOC_FONT = "Poppins";
const FONT_FILES = [
  ["embedRegular", "Poppins-Regular.ttf"],
  ["embedBold", "Poppins-Bold.ttf"],
  ["embedItalic", "Poppins-Italic.ttf"],
  ["embedBoldItalic", "Poppins-BoldItalic.ttf"],
] as const;

/** Symbol fonts drive bullet / list glyphs — swapping them breaks the
 *  glyph, so they keep their face. */
const GLYPH_FONTS = /w:ascii="(Symbol|Wingdings[^"]*|Webdings)"/;

const RFONTS = `<w:rFonts w:ascii="${DOC_FONT}" w:hAnsi="${DOC_FONT}" w:eastAsia="${DOC_FONT}" w:cs="${DOC_FONT}"/>`;

/** Point every font reference in an XML part at DOC_FONT. Theme
 *  attributes (w:asciiTheme…) are dropped with the element, since they'd
 *  otherwise override the explicit face. */
export function useDocFont(xml: string): string {
  return xml.replace(/<w:rFonts\b[^>]*\/>/g, (el) => (GLYPH_FONTS.test(el) ? el : RFONTS));
}

/** Theme major/minor Latin fonts (headings / body) → DOC_FONT. */
function themeFont(xml: string): string {
  return xml.replace(/(<a:(?:majorFont|minorFont)>\s*<a:latin typeface=")[^"]*"/g, `$1${DOC_FONT}"`);
}

/** styles.xml: every style's face → DOC_FONT, and the document-wide
 *  default too, so text with no style of its own is covered. */
function docDefaults(styles: string): string {
  const withFonts = useDocFont(styles);
  if (/<w:rPrDefault>\s*<w:rPr>[\s\S]*?<w:rFonts/.test(withFonts)) return withFonts;
  if (/<w:rPrDefault>\s*<w:rPr>/.test(withFonts)) {
    return withFonts.replace(/<w:rPrDefault>\s*<w:rPr>/, (m) => m + RFONTS);
  }
  return withFonts.replace(
    /<w:docDefaults>/,
    `<w:docDefaults><w:rPrDefault><w:rPr>${RFONTS}</w:rPr></w:rPrDefault>`,
  );
}

/**
 * Obfuscate a TrueType file for embedding (ECMA-376 Part 1, §17.8.1):
 * XOR the first 32 bytes with the font key — the GUID's 16 bytes taken
 * from its hex string in reverse order.
 */
export function obfuscateFont(font: Buffer, guid: string): Buffer {
  const hex = guid.replace(/[{}-]/g, "");
  if (!/^[0-9A-Fa-f]{32}$/.test(hex)) throw new Error(`Bad font key: ${guid}`);
  const key = Array.from({ length: 16 }, (_, i) => parseInt(hex.substr(30 - i * 2, 2), 16));
  const out = Buffer.from(font);
  for (let i = 0; i < 32; i++) out[i] ^= key[i % 16];
  return out;
}

async function embedFont(zip: JSZip): Promise<void> {
  const fontsDir = path.join(process.cwd(), "templates", "fonts");
  const fontTablePath = "word/fontTable.xml";
  const relsPath = "word/_rels/fontTable.xml.rels";
  let fontTable = await zip.file(fontTablePath)?.async("string");
  if (!fontTable) throw new Error("Template has no word/fontTable.xml");

  let rels =
    (await zip.file(relsPath)?.async("string")) ??
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  const embeds: string[] = [];
  for (const [i, [tag, file]] of FONT_FILES.entries()) {
    const guid = `{${randomUUID().toUpperCase()}}`;
    const target = `fonts/${DOC_FONT}${i + 1}.odttf`;
    const rId = `rIdPerfFont${i + 1}`;
    zip.file(`word/${target}`, obfuscateFont(await readFile(path.join(fontsDir, file)), guid));
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${target}"/></Relationships>`,
    );
    embeds.push(`<w:${tag} r:id="${rId}" w:fontKey="${guid}"/>`);
  }

  // Replace any existing entry for the font, then declare it with its
  // embedded faces (child order per the schema: charset, family, pitch,
  // then the embeds).
  fontTable = fontTable.replace(new RegExp(`<w:font w:name="${DOC_FONT}">[\\s\\S]*?</w:font>`), "");
  fontTable = fontTable.replace(
    "</w:fonts>",
    `<w:font w:name="${DOC_FONT}"><w:charset w:val="00"/><w:family w:val="auto"/><w:pitch w:val="variable"/>${embeds.join("")}</w:font></w:fonts>`,
  );
  if (!fontTable.includes('xmlns:r="')) {
    fontTable = fontTable.replace(
      "<w:fonts ",
      '<w:fonts xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
    );
  }
  zip.file(fontTablePath, fontTable);
  zip.file(relsPath, rels);

  const typesPath = "[Content_Types].xml";
  const types = await zip.file(typesPath)!.async("string");
  if (!/Extension="odttf"/.test(types)) {
    zip.file(
      typesPath,
      types.replace(
        /(<Types[^>]*>)/,
        '$1<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>',
      ),
    );
  }

  // Tell Word the file carries its fonts. <w:embedTrueTypeFonts> sits
  // after writeProtection / view / zoom in the settings sequence.
  const settingsPath = "word/settings.xml";
  const settings = await zip.file(settingsPath)?.async("string");
  if (settings && !settings.includes("<w:embedTrueTypeFonts")) {
    const after = /<w:zoom\b[^>]*\/>|<w:view\b[^>]*\/>|<w:writeProtection\b[^>]*\/>/.exec(settings);
    const at = after ? after.index + after[0].length : settings.indexOf(">", settings.indexOf("<w:settings")) + 1;
    zip.file(settingsPath, settings.slice(0, at) + "<w:embedTrueTypeFonts/>" + settings.slice(at));
  }
}

/** Set the whole document in DOC_FONT and embed it. */
async function applyDocFont(zip: JSZip): Promise<void> {
  const parts = Object.keys(zip.files).filter((n) =>
    /^word\/(document|numbering|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n),
  );
  for (const name of parts) {
    zip.file(name, useDocFont(await zip.file(name)!.async("string")));
  }
  const styles = await zip.file("word/styles.xml")?.async("string");
  if (styles) zip.file("word/styles.xml", docDefaults(styles));
  for (const name of Object.keys(zip.files).filter((n) => /^word\/theme\/theme\d*\.xml$/.test(n))) {
    zip.file(name, themeFont(await zip.file(name)!.async("string")));
  }
  await embedFont(zip);
}

export async function renderDocx(r: Report, signOff: SignOff = {}): Promise<Buffer> {
  const file = path.join(process.cwd(), "templates", TEMPLATE[r.kind]);
  const zip = await JSZip.loadAsync(await readFile(file));
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Template has no word/document.xml");
  zip.file("word/document.xml", fillDocument(await entry.async("string"), r, signOff));
  await applyDocFont(zip);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export function docxFileName(r: Report): string {
  const who = r.employee.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${r.kind}_Performance_Review_${who}_${r.period}.docx`;
}
