/**
 * Seed the Domain module's users. Idempotent — matches on email, so
 * re-running won't duplicate anyone (existing users are left untouched).
 *
 * Run from the app container:
 *   docker compose exec app npx tsx scripts/seed-domain.ts
 *
 * Each new account gets its OWN random temporary password, printed once
 * to the console next to the email — hand each person theirs and have
 * them change it on first sign-in. (An earlier version shared one hard-
 * coded password across everyone, which meant anyone who knew the pattern
 * could log in as any un-reset user.) Roles come straight from the roster.
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL_DOMAIN = "inventivebizsol.com";

/** A short, human-typeable random temp password (unique per user). */
function newTempPassword(): string {
  // 9 url-safe bytes → 12 chars, plus a fixed suffix so it always clears
  // the letter+digit/symbol policy in passwordIssue().
  return randomBytes(9).toString("base64url") + "9!";
}

type Role = "Admin" | "Lead" | "TeamLead" | "SME" | "Actionee";

type Person = { first: string; last: string; role: Role };

const ROSTER: Person[] = [
  { first: "Himanshu", last: "Patil", role: "Admin" },
  { first: "Kalpesh", last: "Patil", role: "Lead" },
  { first: "Ajinkya", last: "Patil", role: "TeamLead" },
  { first: "Amruta", last: "Deshpande", role: "TeamLead" },
  { first: "Akshay", last: "Hagare", role: "TeamLead" },
  { first: "Shraddha", last: "Ausarmal", role: "TeamLead" },
  { first: "Vaishali", last: "Velapurkar", role: "SME" },
  { first: "Prashant", last: "Karande", role: "Actionee" },
  { first: "Vaishanavi", last: "Jathar", role: "Actionee" },
  { first: "Rohit", last: "Patil", role: "Actionee" },
  { first: "Vicky", last: "Bhosale", role: "Actionee" },
  { first: "Aniket", last: "Adagale", role: "Actionee" },
  { first: "Abhishek", last: "Bhosale", role: "Actionee" },
  { first: "Monika", last: "Agale", role: "Actionee" },
  { first: "Atharva", last: "Patane", role: "Actionee" },
  { first: "Prem", last: "Prayag", role: "Actionee" },
  { first: "Prasad", last: "Karande", role: "Actionee" },
  { first: "Adnan", last: "Ahmad", role: "Actionee" },
  { first: "Chaitanya", last: "Kanawade", role: "Actionee" },
  { first: "Saurabh", last: "Waghmare", role: "Actionee" },
  { first: "Meghnandan", last: "Nale", role: "Actionee" },
];

function emailFor(p: Person): string {
  return `${p.first}.${p.last}`.toLowerCase().replace(/\s+/g, "") + "@" + EMAIL_DOMAIN;
}

async function main() {
  console.log("\n--- seed-domain ---");
  let created = 0;
  let skipped = 0;
  const issued: { email: string; password: string }[] = [];

  for (const p of ROSTER) {
    const email = emailFor(p);
    const existing = await prisma.domainUser.findUnique({ where: { email } });
    if (existing) {
      console.log(`  = ${email.padEnd(40)} exists (${existing.role}) — skipped`);
      skipped += 1;
      continue;
    }
    const tempPassword = newTempPassword();
    await prisma.domainUser.create({
      data: {
        name: `${p.first} ${p.last}`,
        email,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        role: p.role,
        isActive: true,
      },
    });
    issued.push({ email, password: tempPassword });
    console.log(`  + ${email.padEnd(40)} ${p.role}`);
    created += 1;
  }

  console.log(`\nDone. ${created} created, ${skipped} already existed.`);
  if (issued.length) {
    console.log(
      "\nTemp passwords (unique per user — share privately, they must reset on first sign-in):",
    );
    for (const row of issued) {
      console.log(`  ${row.email.padEnd(40)} ${row.password}`);
    }
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error("\nSEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });