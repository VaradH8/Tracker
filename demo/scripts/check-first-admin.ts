/**
 * Is either module's "first admin" door still open?
 *
 * Tracker sign-up (/api/auth/signup) and the Engineering bootstrap
 * (/api/domain/auth/bootstrap) both let the first visitor make themselves
 * Admin while that module has ZERO users. This prints the counts so you can
 * confirm production is closed. Read-only — it changes nothing.
 *
 *   docker exec -it <app-container> npx tsx scripts/check-first-admin.ts
 *
 * If either module shows 0 users, create its admin now, or set SETUP_TOKEN
 * in the stack's environment so the form also demands that token.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tracker = await prisma.user.count();
  const trackerAdmins = await prisma.user.count({
    where: { isActive: true, OR: [{ isAdmin: true }, { primaryRole: "Admin" }] },
  });
  const engineering = await prisma.domainUser.count();
  const engineeringAdmins = await prisma.domainUser.count({
    where: { isActive: true, role: "Admin" },
  });
  const token = process.env.SETUP_TOKEN?.trim() ? "set" : "not set";

  console.log(`Tracker      users: ${tracker}  active admins: ${trackerAdmins}`);
  console.log(`Engineering  users: ${engineering}  active admins: ${engineeringAdmins}`);
  console.log(`SETUP_TOKEN: ${token}`);
  const open = [tracker === 0 && "Tracker", engineering === 0 && "Engineering"].filter(Boolean);
  if (open.length && token === "not set") {
    console.log(`\nOPEN: anyone who reaches ${open.join(" and ")} first becomes its Admin.`);
    process.exitCode = 1;
  } else {
    console.log("\nOK: no first-admin door is open to strangers.");
  }
}

main().finally(() => prisma.$disconnect());
