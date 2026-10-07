import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { workingDaySet } from "@/lib/engagement";
import { buildReport, type ReportFacts } from "@/lib/performance/report";
import { DOC_FONT, fillDocument, keepWithNext, obfuscateFont, renderDocx, setCellText, textIn, useDocFont } from "@/lib/performance/docx";

function facts(kind: "Monthly" | "Yearly"): ReportFacts {
  return {
    kind,
    period: kind === "Monthly" ? "2026-09" : "2026",
    today: "2026-10-06",
    employee: {
      id: "u1",
      name: "Sanjana Shinde",
      employeeCode: "IBS-042",
      department: "Engineering",
      designation: "Software Engineer",
      joined: "2024-06-01",
      reportingManager: "Rahul Lead",
      assignedManager: "Rahul Lead",
    },
    tasks: [1, 2, 3, 4, 5].map((i) => ({
      id: i,
      title: `TEI task <${i}> & co`,
      description: null,
      projectName: "TEI-SUIT",
      priority: "Medium",
      status: i < 5 ? "Done" : "In Progress",
      important: i === 5,
      startDate: i === 5 ? "2026-08-01" : "2026-09-01",
      targetDate: i === 5 ? "2026-11-30" : "2026-09-20",
      createdAt: "2026-09-01",
      completedAt: i < 5 ? "2026-09-18" : null,
      estimatedHours: 8,
      actualHours: null,
      reopenCount: 0,
      approved: true,
      logged: 8,
      coAssignees: 0,
    })),
    entries: [{ taskId: 1, projectName: "TEI-SUIT", date: "2026-09-02", hours: 140 }],
    leaves: [],
    remarks: 2,
    workDays: workingDaySet(["Mon", "Tue", "Wed", "Thu", "Fri"]),
    hoursPerDay: 8,
  };
}

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file("word/document.xml")!.async("string");
}

describe("setCellText", () => {
  it("keeps cell + run formatting and escapes text", () => {
    const cell =
      '<w:tc><w:tcPr><w:tcW w:w="2102"/></w:tcPr><w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr></w:p></w:tc>';
    const out = setCellText(cell, ["A & B", "<c>"]);
    expect(out).toContain('<w:tcW w:w="2102"/>');
    expect(out).toContain('<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">A &amp; B</w:t></w:r>');
    expect(textIn(out)).toBe("A & B<c>");
  });
});

describe("Poppins font", () => {
  it("rewrites every face except symbol fonts used for bullets", () => {
    const xml =
      '<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/>' +
      '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>' +
      '<w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/>';
    const out = useDocFont(xml);
    expect(out.match(/w:ascii="Poppins"/g)).toHaveLength(2);
    expect(out).not.toContain("asciiTheme");
    expect(out).toContain('w:ascii="Symbol"');
  });

  it("obfuscates per ECMA-376 §17.8.1 (key = GUID bytes reversed; XOR is its own inverse)", () => {
    const font = Buffer.from(Array.from({ length: 40 }, (_, i) => i));
    const guid = "{00112233-4455-6677-8899-AABBCCDDEEFF}";
    const out = obfuscateFont(font, guid);
    expect(out[0]).toBe(0x00 ^ 0xff); // last GUID byte first
    expect(out[15]).toBe(15 ^ 0x00);
    expect(out[16]).toBe(16 ^ 0xff); // key repeats for bytes 16–31
    expect(out[32]).toBe(32); // rest untouched
    expect(obfuscateFont(out, guid).equals(font)).toBe(true);
  });
});

describe.each(["Monthly", "Yearly"] as const)("%s Word document", (kind) => {
  it("has the company logo in the page header", async () => {
    const zip = await JSZip.loadAsync(await renderDocx(buildReport(facts(kind), {})));
    const part = (n: string) => zip.file(n)!.async("string");

    expect(zip.file("word/media/inventive-logo.png")).toBeTruthy();
    expect(await part("word/header1.xml")).toContain('r:embed="rIdLogo"');
    expect(await part("word/_rels/header1.xml.rels")).toContain('Target="media/inventive-logo.png"');
    expect(await part("word/_rels/document.xml.rels")).toContain('Id="rIdPerfHeader"');
    expect(await part("word/document.xml")).toMatch(/<w:sectPr\b[^>]*><w:headerReference w:type="default" r:id="rIdPerfHeader"\/>/);
    const types = await part("[Content_Types].xml");
    expect(types).toContain('Extension="png"');
    expect(types).toContain('PartName="/word/header1.xml"');
  });

  it("is set in Poppins throughout, with the font embedded", async () => {
    const report = buildReport(facts(kind), {});
    const zip = await JSZip.loadAsync(await renderDocx(report));
    const part = (n: string) => zip.file(n)!.async("string");

    for (const n of ["word/styles.xml", "word/document.xml", "word/numbering.xml"]) {
      const faces = [...(await part(n)).matchAll(/<w:rFonts[^>]*>/g)].map((m) => m[0]);
      for (const f of faces) {
        if (!/Symbol/.test(f)) expect(f).toContain(`w:ascii="${DOC_FONT}"`);
      }
    }
    expect(await part("word/styles.xml")).toMatch(/<w:rPrDefault><w:rPr>[\s\S]*?w:ascii="Poppins"/);
    const theme = await part("word/theme/theme1.xml");
    expect(theme.match(/<a:latin typeface="([^"]*)"/g)).toEqual([
      '<a:latin typeface="Poppins"',
      '<a:latin typeface="Poppins"',
    ]);

    const fontTable = await part("word/fontTable.xml");
    for (const tag of ["embedRegular", "embedBold", "embedItalic", "embedBoldItalic"]) {
      expect(fontTable).toMatch(new RegExp(`<w:${tag} r:id="rIdPerfFont\\d" w:fontKey="\\{[0-9A-F-]{36}\\}"/>`));
    }
    expect(zip.file(/^word\/fonts\/Poppins\d\.odttf$/)).toHaveLength(4);
    expect(await part("word/_rels/fontTable.xml.rels")).toContain('Target="fonts/Poppins1.odttf"');
    expect(await part("[Content_Types].xml")).toContain('Extension="odttf"');
    expect(await part("word/settings.xml")).toContain("<w:embedTrueTypeFonts/>");
  });

  it("fills the official template and keeps its structure", async () => {
    const report = buildReport(facts(kind), {
      "rating.quality.employee": "4",
      "rating.quality.manager": "4",
      "self.achievements": "Closed the ESP change spec",
      "summary.feedback": "Strong month",
      "hr.professional.rating": "5",
      "hr.professional.comments": "Courteous with clients",
      "hr.attendance.rating": "3",
    });
    const xml = await documentXml(await renderDocx(report, { hrName: "Hema HR" }));
    const text = textIn(xml);

    // Same document: header and criteria pages untouched.
    expect(text).toContain("INVENTIVE BUSINESS SOLUTIONS PVT. LTD.");
    expect(text).toContain(kind === "Monthly" ? "Monthly Evaluation Criteria" : "Annual Evaluation Criteria");

    // HR Evaluation in place of the rating scale; numbering unchanged.
    expect(xml.match(/<w:tbl>/g)).toHaveLength(10);
    expect(text).not.toContain("Rating Scale");
    expect(text).not.toContain("Needs Improvement1Unsatisfactory"); // the scale table's last rows
    expect(text).toContain(
      "8. HR EvaluationEvaluation AreaHR Rating (1–5)HR Comments" +
        "Professional Behaviour5Courteous with clients" +
        "Learning & Development" +
        "Initiative & Ownership" +
        "Attendance & Punctuality3" +
        "Teamwork & Collaboration" +
        "Communication" +
        "Discipline & Policy Compliance" +
        "9. Sign-Off",
    );
    expect(text).toContain(`10. ${kind === "Monthly" ? "Monthly" : "Annual"} Performance Criteria`);

    // Sign-off: name and date, no signature line.
    expect(text).toContain("Name: Hema HRDate:");
    expect(text).not.toContain("Signature");

    // Filled in.
    for (const s of ["Sanjana Shinde", "IBS-042", "Engineering", "Rahul Lead", "Closed the ESP change spec", "Strong month", "Name: Hema HR"]) {
      expect(text).toContain(s);
    }
    expect(text).not.toContain("____ / 5");
    expect(text).toContain(`☒ ${report.summary.level}`);
    if (kind === "Monthly") {
      expect(text).toContain("TEI task <1> & co (TEI-SUIT)");
      expect(text).toContain("September 2026");
      expect(text).not.toContain("High / Medium / Low");
      expect(text).not.toContain("On Track / At Risk / Delayed / Completed");
      // Escaped, so the XML stays valid.
      expect(xml).toContain("TEI task &lt;1&gt; &amp; co");
    } else {
      expect(text).toContain("Task completion rate");
      expect(text).toContain("01 Jun 2024");
      expect(text).toContain(`☒ ${report.summary.priority}`);
    }
    // No duplicated paragraph ids from cloned rows.
    const ids = [...xml.matchAll(/w14:paraId="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Tables stay on one page", () => {
  it("keeps every row unsplit and with the next, and the heading with its table", async () => {
    const xml = await documentXml(await renderDocx(buildReport(facts("Monthly"), {})));
    const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g)!;
    expect(tables).toHaveLength(10);
    for (const t of tables) {
      const rows = t.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g)!;
      for (const [i, row] of rows.entries()) {
        expect(row).toContain("<w:cantSplit/>");
        const paras = row.match(/<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)!;
        for (const p of paras) {
          // The last row lets go, so the next section can start a page.
          expect(p.includes("<w:keepNext/>")).toBe(i < rows.length - 1);
        }
      }
    }
    const before = [...xml.matchAll(/(<w:p[ >](?:(?!<w:p[ >])[\s\S])*?<\/w:p>)<w:tbl>/g)];
    expect(before).toHaveLength(10);
    for (const [, p] of before) expect(p).toContain("<w:keepNext/>");
    expect(textIn(before[4][1])).toBe("5. Employee Self-Assessment");
  });

  it("puts keepNext where the schema wants it", () => {
    expect(keepWithNext('<w:p w14:paraId="1"/>')).toBe('<w:p w14:paraId="1"><w:pPr><w:keepNext/></w:pPr></w:p>');
    expect(keepWithNext("<w:p><w:r><w:t>x</w:t></w:r></w:p>")).toBe(
      "<w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>",
    );
    expect(keepWithNext('<w:p><w:pPr><w:pStyle w:val="H2"/><w:jc w:val="center"/></w:pPr></w:p>')).toBe(
      '<w:p><w:pPr><w:pStyle w:val="H2"/><w:keepNext/><w:jc w:val="center"/></w:pPr></w:p>',
    );
  });
});

describe("Send-to selection", () => {
  it("is never written into the Word document", async () => {
    const zip = await JSZip.loadAsync(
      await (await import("node:fs/promises")).readFile("templates/monthly-performance-review.docx"),
    );
    const xml = await zip.file("word/document.xml")!.async("string");
    const base = { "summary.employeeComments": "Please review my leave" };
    const without = fillDocument(xml, buildReport(facts("Monthly"), base));
    const withHr = fillDocument(xml, buildReport(facts("Monthly"), { ...base, "summary.commentTo": "hr" }));
    const withManager = fillDocument(xml, buildReport(facts("Monthly"), { ...base, "summary.commentTo": "manager" }));
    expect(withHr).toBe(without);
    expect(withManager).toBe(without);
    expect(textIn(without)).toContain("Please review my leave");
  });
});

describe("No tracker remarks on the form", () => {
  it("leaves unrated areas and unwritten remarks blank", async () => {
    const report = buildReport(facts("Monthly"), {});
    const xml = await (await JSZip.loadAsync(await renderDocx(report))).file("word/document.xml")!.async("string");
    const text = textIn(xml);
    for (const a of report.areas) expect(text).not.toContain(a.evidence);
    expect(text).toContain("____ / 5"); // nothing rated → blank overall
    expect(text).not.toContain("☒"); // no performance level ticked
  });
});
