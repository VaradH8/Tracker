/**
 * Why can't this person sign in?
 *
 * Run on the box, against the live database. It answers the four things
 * that stop a login and that a password reset does not fix, in the order
 * they are worth checking:
 *
 *   1. no account matches the email they are typing
 *   2. the stored email is not what anyone thinks it is — a capital, a
 *      trailing space, a different domain
 *   3. the account is deactivated
 *   4. there are two accounts and the reset landed on the other one
 *
 * It reads. It changes nothing. Pass a password to check it against the
 * stored hash without signing anybody in.
 *
 *   docker exec -it tracker-app-1 \
 *     node scripts/why-cant-they-log-in.cjs "mukesh bhamre"
 *
 *   docker exec -it tracker-app-1 \
 *     node scripts/why-cant-they-log-in.cjs mukesh@example.com "thePassword"
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const q = (process.argv[2] ?? "").trim();
const password = process.argv[3] ?? null;

if (!q) {
  console.log("Usage: node scripts/why-cant-they-log-in.cjs <name or email> [password]");
  process.exit(1);
}

/** Quoted so a trailing space or a capital is visible rather than implied. */
const show = (s) => JSON.stringify(s);

(async () => {
  const all = await prisma.domainUser.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });

  const needle = q.toLowerCase();
  const matches = all.filter(
    (u) =>
      u.name.toLowerCase().includes(needle) ||
      u.email.toLowerCase().includes(needle),
  );

  console.log(`\n${all.length} accounts in total; ${matches.length} match ${show(q)}\n`);

  if (matches.length === 0) {
    console.log("  No account matches that at all.");
    console.log("  → They are typing an address nobody has. Check the exact");
    console.log("    spelling with them, then look for near misses:\n");
    for (const u of all.slice(0, 40)) console.log(`      ${show(u.email)}  ${u.name}`);
    await prisma.$disconnect();
    return;
  }

  if (matches.length > 1) {
    console.log("  MORE THAN ONE ACCOUNT MATCHES.");
    console.log("  → A reset done by picking a name may have landed on the");
    console.log("    other one. Compare the emails below with what they type.\n");
  }

  for (const u of matches) {
    console.log(`  ${u.name}  (${u.role})`);
    console.log(`    id            ${u.id}`);
    console.log(`    email stored  ${show(u.email)}`);

    const clean = u.email.trim().toLowerCase();
    if (clean !== u.email) {
      console.log(`    ^^ NOT CLEAN. Sign-in looks up ${show(clean)} and this row`);
      console.log(`       is stored as ${show(u.email)}, so an exact lookup misses it.`);
      console.log(`       Fixed in the app as of 20ba05a; on older builds this`);
      console.log(`       account is unreachable no matter what the password is.`);
    }

    console.log(`    active        ${u.isActive}`);
    if (!u.isActive) {
      console.log("    ^^ DEACTIVATED. Older builds answer 'Wrong email or password'");
      console.log("       for this, which is why it looks like a password problem.");
      console.log("       Switch them back on from People.");
    }

    console.log(`    password set  ${u.updatedAt.toISOString()}`);

    if (password) {
      const ok = await bcrypt.compare(password, u.passwordHash);
      console.log(`    given password ${ok ? "MATCHES this account" : "does NOT match"}`);
      if (ok && u.isActive && clean === u.email) {
        console.log("    → Credentials are fine. That leaves the login throttle:");
        console.log("      it is held in the app's memory, so restarting the app");
        console.log("      container clears every lockout immediately.");
      }
    } else {
      console.log("    (pass the password as a second argument to test it)");
    }
    console.log("");
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
