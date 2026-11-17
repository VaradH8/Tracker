/**
 * Create the PM Inventive service account (if missing) and issue a token.
 *
 *   npx tsx scripts/create-service-token.ts <email> [name] [token-name]
 *
 * e.g. in production:
 *   docker exec -it <app-container> npx tsx scripts/create-service-token.ts \
 *     pm-inventive@inventivebizsol.co.in "PM Inventive" prod
 *
 * Prints the raw token once. Put it straight into the password manager.
 * Additive only: never modifies or removes existing data.
 */
import { prisma } from "../lib/db";
import { ensureServiceAccount, issueApiToken } from "../lib/api-v1/auth";

async function main() {
  const [email, name = "PM Inventive", tokenName = "default"] = process.argv.slice(2);
  if (!email) {
    console.error("usage: npx tsx scripts/create-service-token.ts <email> [name] [token-name]");
    process.exit(1);
  }
  const account = await ensureServiceAccount({ name, email });
  const token = await issueApiToken({ userId: account.id, name: tokenName });
  console.log(`${account.created ? "Created" : "Using"} service account ${email} (${account.id})`);
  console.log(`Token "${tokenName}" (id ${token.id}):\n\n  ${token.token}\n`);
  console.log("This is the only time the token is shown.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
