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
  /** Section 8: the template's Rating Scale, replaced by HR Evaluation. */
  ratingScale: 7,
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

  /** Swap a section of the template for another: retitle its heading
   *  (keeping the number and the heading's formatting) and replace its
   *  table `t` with `table`. */
  replaceSection(t: number, from: string, to: string, table: string) {
    const heading = new RegExp(`(<w:t>\\d+\\. )${from}(</w:t>)`);
    if (!heading.test(this.xml)) throw new Error(`Template heading not found: "${from}"`);
    // Headings sit outside tables, and tables are swapped back in by
    // toString, so this only touches the heading.
    this.xml = this.xml.replace(heading, `$1${esc(to)}$2`);
    this.tables[t] = table;
  }

  /** The table at `t` as it stands — to borrow its look. */
  table(t: number): string {
    return this.tables[t];
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

/**
 * The HR Evaluation table — Area | HR Rating (1–5) | HR Comments — in the
 * look of the section 4 assessment table (`assessment`, 4 equal columns):
 * its table properties, shaded header and row formatting. The area
 * column takes ~0.5in from the rating column so every label fits on one
 * line, and the comments column takes the width of the last two.
 */
export function hrTable(assessment: string, rows: string[][]): string {
  const tblPr = /<w:tblPr>[\s\S]*?<\/w:tblPr>/.exec(assessment)?.[0] ?? "";
  const [header, proto] = assessment.match(ROW_RE) ?? [];
  if (!header || !proto) throw new Error("Assessment table has no rows");
  // Every cell is styled from the row's first cell: it carries the run
  // formatting (size, bold) that the template's empty cells lack.
  const widths = cellsOf(header).map((c) => Number(/<w:tcW w:w="(\d+)"/.exec(c)?.[1] ?? 0));
  const cols = [widths[0] + 700, widths[1] - 700, widths[2] + widths[3]];
  const rowOf = (template: string, values: string[]) => {
    const cell = cellsOf(template)[0];
    const open = template.slice(0, template.indexOf("<w:tc>"));
    const cells = values.map((v, i) => setCellText(cell.replace(/(<w:tcW w:w=")\d+/, `$1${cols[i]}`), v));
    return stripIds(`${open}${cells.join("")}</w:tr>`);
  };
  const grid = `<w:tblGrid>${cols.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  const head = rowOf(header, ["Evaluation Area", "HR Rating (1–5)", "HR Comments"]);
  return `<w:tbl>${tblPr}${grid}${head}${rows.map((r) => rowOf(proto, r)).join("")}</w:tbl>`;
}

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
      3: a.comments,
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

  /* 8. HR Evaluation — in place of the template's Rating Scale. */
  doc.replaceSection(
    T.ratingScale,
    "Rating Scale",
    "HR Evaluation",
    hrTable(
      doc.table(T.assessment),
      r.hr.map((h) => [h.label, ratingCell(h.rating), h.comments]),
    ),
  );

  /* 9. Sign-off — names filled; dates stay for ink. */
  const sign = (name: string) => [`Name: ${name}`, "Date:"];
  doc.data(T.signoff, [[sign(e.name), sign(e.reportingManager), sign(signOff.hrName ?? "")]]);

  return keepTablesTogether(doc.toString());
}

/* ------------------------------------------------------- pagination */

const PARA_RE = /<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;

/** Mark a paragraph "keep with next" (w:keepNext follows w:pStyle in
 *  the pPr sequence, before everything else). */
export function keepWithNext(p: string): string {
  if (p.includes("<w:keepNext/>")) return p;
  const empty = /^<w:p((?:\s[^>]*?)?)\s*\/>$/.exec(p);
  if (empty) return `<w:p${empty[1]}><w:pPr><w:keepNext/></w:pPr></w:p>`;
  if (/<w:pPr>/.test(p)) {
    return /<w:pPr><w:pStyle\b[^>]*\/>/.test(p)
      ? p.replace(/(<w:pPr><w:pStyle\b[^>]*\/>)/, "$1<w:keepNext/>")
      : p.replace("<w:pPr>", "<w:pPr><w:keepNext/>");
  }
  return p.replace(/^(<w:p(?:\s[^>]*)?>)/, "$1<w:pPr><w:keepNext/></w:pPr>");
}

/** Add row properties (w:trPr children may come in any order). */
function rowProps(row: string, ...props: string[]): string {
  const add = props.filter((p) => !row.includes(p)).join("");
  if (!add) return row;
  return /<w:trPr>/.test(row)
    ? row.replace("<w:trPr>", `<w:trPr>${add}`)
    : row.replace(/^(<w:tr(?:\s[^>]*)?>)/, `$1<w:trPr>${add}</w:trPr>`);
}

/** Height of the page body in twips: the page less its margins, with
 *  the top pushed down to clear the logo header. */
export function bodyHeight(xml: string): number {
  const h = Number(/<w:pgSz\b[^>]*\bw:h="(\d+)"/.exec(xml)?.[1] ?? 15840);
  const mar = /<w:pgMar\b[^>]*>/.exec(xml)?.[0] ?? "";
  const at = (a: string, d: number) => Number(new RegExp(`\\bw:${a}="(\\d+)"`).exec(mar)?.[1] ?? d);
  const top = Math.max(at("top", 1440), at("header", 720) + LOGO_H / 635 + 200);
  return h - top - at("bottom", 1440);
}

/** Lines a paragraph of `text` takes in `width` twips, wrapping on
 *  words (a word longer than the line breaks across lines). */
function wrappedLines(text: string, width: number, charW: number): number {
  const perLine = Math.max(1, Math.floor(width / charW));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const len = word.length;
    if (used && used + 1 + len > perLine) {
      lines += 1;
      used = 0;
    }
    if (len > perLine) {
      lines += Math.floor((used + len) / perLine);
      used = (used + len) % perLine;
    } else used += (used ? 1 : 0) + len;
  }
  return lines;
}

/**
 * A generous estimate of a table's height in twips. Table text here is
 * single-spaced with no paragraph spacing (the TableGrid style), in
 * Poppins: ~0.6em a character and lines 1.5× the font size.
 */
export function tableHeight(table: string): number {
  let total = 0;
  for (const row of table.match(ROW_RE) ?? []) {
    let tallest = 0;
    for (const cell of cellsOf(row)) {
      const width = Number(/<w:tcW w:w="(\d+)"/.exec(cell)?.[1] ?? 2000) - 216; // less cell margins
      const sz = Number(/<w:sz w:val="(\d+)"/.exec(cell)?.[1] ?? 18); // half-points
      const charW = sz * 6;
      const lines = (cell.match(PARA_RE) ?? [""]).reduce((n, p) => n + wrappedLines(textIn(p), width, charW), 0);
      tallest = Math.max(tallest, lines * sz * 15);
    }
    total += tallest + 30; // borders
  }
  return total;
}

/**
 * Page breaks around tables. No row ever splits, and each table starts
 * under its heading:
 *   - A table that fits on a page is kept whole with its heading: if
 *     it doesn't fit in what's left of the page, both move to the next.
 *   - A longer table starts right under its heading and runs on, its
 *     header row repeated on each page. Only the heading, header row and
 *     first row are held together, so a heading at the foot of a page
 *     moves down with them rather than being left on its own.
 */
export function keepTablesTogether(xml: string): string {
  // Room for a table plus its heading on one page, with some slack.
  const fits = bodyHeight(xml) * 0.9 - 600;
  return xml
    .replace(TABLE_RE, (table) => {
      const rows = table.match(ROW_RE) ?? [];
      const whole = tableHeight(table) <= fits;
      let i = -1;
      return table.replace(ROW_RE, (row) => {
        i += 1;
        if (whole) {
          const r = rowProps(row, "<w:cantSplit/>");
          return i < rows.length - 1 ? r.replace(PARA_RE, keepWithNext) : r;
        }
        if (i === 0) return rowProps(row, "<w:cantSplit/>", "<w:tblHeader/>").replace(PARA_RE, keepWithNext);
        return rowProps(row, "<w:cantSplit/>");
      });
    })
    .replace(/(<w:p[ >](?:(?!<w:p[ >])[\s\S])*?<\/w:p>)(<w:tbl>)/g, (_, p, tbl) => keepWithNext(p) + tbl);
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

/* --------------------------------------------------------------- logo */

/** The company logo, top-left on every page (a page header). It's the
 *  app's logo with the white lettering set in navy so it reads on paper
 *  — templates/inventive-logo-print.png, 621×206. */
const LOGO_FILE = "inventive-logo-print.png";
const LOGO_H = 457200; // 0.5in in EMU
const LOGO_W = Math.round((LOGO_H * 621) / 206);

const LOGO_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${LOGO_W}" cy="${LOGO_H}"/><wp:docPr id="9001" name="Inventive logo" descr="Inventive Business Solutions"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="9001" name="${LOGO_FILE}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${LOGO_W}" cy="${LOGO_H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:hdr>`;

/** Add the logo header and point the document's section at it. */
async function addLogoHeader(zip: JSZip): Promise<void> {
  zip.file("word/media/inventive-logo.png", await readFile(path.join(process.cwd(), "templates", LOGO_FILE)));
  zip.file("word/header1.xml", LOGO_HEADER);
  zip.file(
    "word/_rels/header1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/inventive-logo.png"/></Relationships>',
  );

  const relsPath = "word/_rels/document.xml.rels";
  const rels = await zip.file(relsPath)!.async("string");
  zip.file(
    relsPath,
    rels.replace(
      "</Relationships>",
      '<Relationship Id="rIdPerfHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>',
    ),
  );

  // headerReference is the first child of sectPr.
  const docPath = "word/document.xml";
  const doc = await zip.file(docPath)!.async("string");
  zip.file(docPath, doc.replace(/(<w:sectPr\b[^>]*>)/g, '$1<w:headerReference w:type="default" r:id="rIdPerfHeader"/>'));

  const typesPath = "[Content_Types].xml";
  let types = await zip.file(typesPath)!.async("string");
  if (!/Extension="png"/i.test(types)) {
    types = types.replace(/(<Types[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>');
  }
  types = types.replace(
    "</Types>",
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
  );
  zip.file(typesPath, types);
}

export async function renderDocx(r: Report, signOff: SignOff = {}): Promise<Buffer> {
  const file = path.join(process.cwd(), "templates", TEMPLATE[r.kind]);
  const zip = await JSZip.loadAsync(await readFile(file));
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Template has no word/document.xml");
  zip.file("word/document.xml", fillDocument(await entry.async("string"), r, signOff));
  await addLogoHeader(zip);
  await applyDocFont(zip);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export function docxFileName(r: Report): string {
  const who = r.employee.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${r.kind}_Performance_Review_${who}_${r.period}.docx`;
}
