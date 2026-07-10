/** Blank import template: 7 correctly-named sheets, each with the team
 *  header labels and the column header row — no data rows. */
import path from "node:path";
import * as XLSX from "xlsx";

const OUT = "C:/Users/sanjjad/Downloads/Ongoing_Projects_Template.xlsx";

const SHEETS = [
  "AMC", "POCs", "Samanvay - Engg Memory", "Support Automation",
  "Thermax ENIMAX", "Thermax P&ID", "Thermax QA",
];
const HEADER = [
  "Project", "Sr No", "Priority", "Task Description", "Task Assign by",
  "Person Responsible", "Efforts (Hrs)", "Start Date", "Target date",
  "Status", "Approved By", "Remark",
];

const wb = XLSX.utils.book_new();
for (const name of SHEETS) {
  const aoa: string[][] = [
    ["Team Lead", ""],
    ["Coordinator", ""],
    ["Team Members", ""],
    [],
    HEADER,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = HEADER.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}
XLSX.writeFile(wb, OUT);
console.log("Wrote", OUT, "with sheets:", SHEETS.join(", "));
