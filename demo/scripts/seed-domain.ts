/**
 * Seed the Domain module's users. Idempotent — matches on email, so
 * re-running won't duplicate anyone (existing users are left untouched).
 *
 * Run from the app container:
 *   docker compose exec app npx tsx scripts/seed-domain.ts
 *
 * Everyone is created with the same temporary password below; they should
 * reset it on first sign-in. Roles come straight from the roster.
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEMP_PASSWORD = "Tracker@2026";
const EMAIL_DOMAIN = "inventivebizsol.com";

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
  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);
  let created = 0;
  let skipped = 0;

  for (const p of ROSTER) {
    const email = emailFor(p);
    const existing = await prisma.domainUser.findUnique({ where: { email } });
    if (existing) {
      console.log(`  = ${email.padEnd(40)} exists (${existing.role}) — skipped`);
      skipped += 1;
      continue;
    }
    await prisma.domainUser.create({
      data: {
        name: `${p.first} ${p.last}`,
        email,
        passwordHash,
        role: p.role,
        isActive: true,
      },
    });
    console.log(`  + ${email.padEnd(40)} ${p.role}`);
    created += 1;
  }

  console.log(`\nDone. ${created} created, ${skipped} already existed.`);
  console.log(`Temp password for new accounts: ${TEMP_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error("\nSEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });