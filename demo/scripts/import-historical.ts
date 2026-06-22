/**
 * One-shot CLI importer for the weekly tracker CSVs the team has been
 * maintaining in Excel since week 19. Reads every *.csv in a directory,
 * maps each filename to a service area, and hands the rows to the shared
 * import engine (lib/import/historical.ts) — the same engine that powers
 * the Settings → Import page.
 *
 * Usage (from the app container):
 *   npx tsx scripts/import-historical.ts --dir /import --dry-run
 *   npx tsx scripts/import-historical.ts --dir /import
 *
 * --dry-run prints exactly what it would do without touching the DB.
 * The flag is opt-OUT — running without --dry-run writes for real.
 */

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { PrismaClient } from "@prisma/client";
import {
  parseSheets,
  commitParsed,
  type SheetInput,
} from "../lib/import/historical";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const IMPORT_DIR =
  argv.find((a) => a.startsWith("--dir="))?.slice("--dir=".length) ??
  (argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : null) ??
  "/import";

/** Filename → service area label. The xlsx path maps sheet names instead
 *  (see serviceAreaForSheet in the shared lib); the CLI keeps the CSV
 *  filename mapping the team's export produces. */
const FILE_TO_SERVICE: Record<string, string> = {
  "Ongoing Projects (3)-AMC.csv": "AMC",
  "Ongoing Projects (3)-POCs.csv": "POCs",
  "Ongoing Projects (3)-Samanvay - Engg Memory.csv": "Samanvay",
  "Ongoing Projects (3)-Support Automation .csv": "Support Automation",
  "Ongoing Projects (3)-Thermax ENIMAX.csv": "Thermax ENIMAX",
  "Ongoing Projects (3)-Thermax P&ID.csv": "Thermax P&ID",
  "Ongoing Projects (3)-Thermax QA.csv": "Thermax QA",
};

async function main() {
  console.log(`\n--- import-historical ---`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`Reading from: ${IMPORT_DIR}\n`);

  if (!fs.existsSync(IMPORT_DIR)) {
    console.error(`Directory not found: ${IMPORT_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(IMPORT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();
  if (files.length === 0) {
    console.error("No .csv files in import directory.");
    process.exit(1);
  }

  const sheets: SheetInput[] = [];
  for (const f of files) {
    const serviceArea = FILE_TO_SERVICE[f];
    if (!serviceArea) {
      console.warn(`  ${f} skipped: not in FILE_TO_SERVICE`);
      continue;
    }
    const content = fs.readFileSync(path.join(IMPORT_DIR, f), "utf-8");
    const rows = Papa.parse<string[]>(content, { header: false }).data as string[][];
    sheets.push({ serviceArea, rows });
  }

  const parsed = parseSheets(sheets);
  for (const s of parsed.perSheet) {
    console.log(
      `  ${s.serviceArea.padEnd(20)} → ${s.taskCount} task rows, lead=${s.lead.join("/") || "-"} coord=${s.coordinator.join("/") || "-"}`,
    );
  }
  console.log(
    `\nParsed ${parsed.rawTaskCount} rows → ${parsed.tasks.length} unique tasks after latest-week dedup`,
  );
  if (parsed.unmatchedNames.length) {
    console.log(`Unmatched names (assignments skipped): ${parsed.unmatchedNames.join(", ")}`);
  }
  console.log("");

  const { stats, unknownPeopleKeys } = await commitParsed(prisma, parsed, {
    dryRun: DRY_RUN,
  });
  for (const k of unknownPeopleKeys) {
    console.warn(`  ! Unknown PEOPLE key: "${k}" (skipping)`);
  }

  if (!DRY_RUN) {
    const admin = await prisma.user.findFirst({
      where: { isAdmin: true },
      select: { id: true },
    });
    if (admin) {
      await prisma.auditEntry.create({
        data: {
          actorId: admin.id,
          action: "import.historical",
          scope: "weekly-tracker-csv",
          before: null,
          after: `${stats.tasksCreated + stats.tasksUpdated} tasks across ${stats.projectsCreated + stats.projectsReused} projects`,
        },
      });
    }
  }

  console.log("\n--- summary ---");
  console.log(`Users:    ${stats.usersCreated} created, ${stats.usersReused} reused`);
  console.log(`Clients:  ${stats.clientsCreated} created, ${stats.clientsReused} reused`);
  console.log(`Projects: ${stats.projectsCreated} created, ${stats.projectsReused} reused`);
  console.log(`Roster rows: ${stats.memberRowsCreated} created`);
  console.log(`Tasks:    ${stats.tasksCreated} created, ${stats.tasksUpdated} updated`);
  console.log(`Remarks:  ${stats.remarksCreated} created`);
  console.log(
    `\n${DRY_RUN ? "DRY RUN — no DB writes. Re-run without --dry-run to apply." : "Done. Imported."}\n`,
  );
}

main()
  .catch((e) => {
    console.error("\nIMPORT FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });