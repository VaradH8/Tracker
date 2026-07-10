/**
 * Build a normalized, import-ready Ongoing_Projects.xlsx from the raw
 * weekly-tracker CSVs. Runs each sheet through the app's OWN parser
 * (parseSheets) so dedup + people-mapping match the importer exactly,
 * then emits one clean sheet per service area:
 *   Team Lead / Coordinator / Team Members header rows,
 *   a single column header, and one row per unique task (latest status),
 *   with an explicit Project column and no week rows.
 * That layout imports fully in one go, even without parser patches.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  parseSheets,
  serviceAreaForSheet,
  type SheetInput,
} from "../../demo/lib/import/historical.ts";

const INPUT = "C:/Users/sanjjad/Downloads";
const OUT = path.join(import.meta.dirname, "Ongoing_Projects.xlsx");

// Input filename (normalized) -> output sheet name the importer recognizes.
const ALIASES: Record<string, string> = {
  amc: "AMC",
  pocs: "POCs",
  "samanvay - engg memory": "Samanvay - Engg Memory",
  "samanvay engg memory": "Samanvay - Engg Memory",
  "support automation": "Support Automation",
  "thermax enimax": "Thermax ENIMAX",
  "thermax p&id": "Thermax P&ID",
  "thermax p id": "Thermax P&ID",
  "thermax pid": "Thermax P&ID",
  "thermax qa": "Thermax QA",
};
const norm = (f: string) =>
  f.replace(/\.csv$/i, "").replace(/[_&]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const HEADER = [
  "Project", "Sr No", "Priority", "Task Description", "Task Assign by",
  "Person Responsible", "Efforts (Hrs)", "Start Date", "Target date",
  "Status", "Approved By", "Remark",
];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (d: Date | null) =>
  d ? `${d.getUTCDate()}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}` : "";

const ORDER = [
  "AMC", "POCs", "Samanvay - Engg Memory", "Support Automation",
  "Thermax ENIMAX", "Thermax P&ID", "Thermax QA",
];

const files = fs.readdirSync(INPUT).filter((f) => f.toLowerCase().endsWith(".csv"));
const bySheet = new Map<string, string>();
for (const f of files) {
  const sheet = ALIASES[norm(f)];
  if (sheet) bySheet.set(sheet, path.join(INPUT, f));
}

const meta: { sheetName: string; serviceArea: string }[] = [];
const parseInput: SheetInput[] = [];
for (const sheetName of ORDER) {
  const fp = bySheet.get(sheetName);
  if (!fp) { console.log(`!! no input file for ${sheetName}`); continue; }
  const content = fs.readFileSync(fp, "utf-8");
  const rows = Papa.parse<string[]>(content, { header: false }).data as string[][];
  const serviceArea = serviceAreaForSheet(sheetName) ?? sheetName;
  parseInput.push({ serviceArea, rows });
  meta.push({ sheetName, serviceArea });
}

const parsed = parseSheets(parseInput);

const wb = XLSX.utils.book_new();
for (const { sheetName, serviceArea } of meta) {
  const header = parsed.headerByService.get(serviceArea);
  const tasks = parsed.tasks.filter((t) => t.serviceArea === serviceArea);
  const aoa: (string | number)[][] = [
    ["Team Lead", (header?.lead ?? []).join(", ")],
    ["Coordinator", (header?.coordinator ?? []).join(", ")],
    ["Team Members", (header?.members ?? []).join(", ")],
    [],
    HEADER,
    ...tasks.map((t, i) => [
      t.subProjectLabel, i + 1, t.priority, t.description,
      t.responsibleNames.join(", "), t.assigneeNames.join(", "),
      t.estimatedHours ?? "", fmt(t.startDate), fmt(t.targetDate),
      t.status, t.approvedByNames.join(", "), t.remark,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  console.log(
    `${sheetName.padEnd(24)} ${String(tasks.length).padStart(3)} tasks | ` +
    `lead=${(header?.lead || []).join("/") || "-"} coord=${(header?.coordinator || []).join("/") || "-"}`,
  );
}
XLSX.writeFile(wb, OUT);
console.log(`\nWrote ${OUT}`);
console.log(`Total unique tasks: ${parsed.tasks.length}`);
if (parsed.unmatchedNames.length)
  console.log(`Unmatched names (assignments skipped on import): ${parsed.unmatchedNames.join(", ")}`);
