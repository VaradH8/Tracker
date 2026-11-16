import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * E6: reset links stay out of the Email log once email is really sent.
 * E7: the JSON backup covers every table and leaves password hashes out
 *     unless asked.
 * E8: SETUP_TOKEN, when set, guards the first-admin forms.
 */

vi.mock("@/lib/db", () => {
  const delegate = () => ({ findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 0 }) });
  const models = [
    "user", "client", "appSettings", "project", "projectMember", "task", "taskAssignee",
    "taskDependency", "taskAttachment", "timeEntry", "remark", "auditEntry", "notification",
    "emailLog", "leave", "resourceForecast", "performanceReview", "pipelineDeal", "domainUser",
    "domainEmployee", "domainProject", "domainDivision", "domainProjectDivision",
    "domainAllocation", "domainTagAssignment", "domainDeliveryCorrection", "domainTagSubmission",
    "domainTask", "domainDefaultReviewer", "domainTaskReviewer", "domainTaskAttachment",
    "domainTaskEvent", "domainWorkLog", "domainHoliday", "domainLeave",
  ];
  const prisma: Record<string, unknown> = Object.fromEntries(models.map((m) => [m, delegate()]));
  prisma.user = { ...delegate(), findUnique: vi.fn(), count: vi.fn() };
  prisma.passwordResetToken = { create: vi.fn() };
  prisma.emailLog = { ...delegate(), create: vi.fn() };
  prisma.domainUser = { ...delegate(), count: vi.fn() };
  prisma.auditEntry = { ...delegate(), create: vi.fn() };
  prisma.$executeRawUnsafe = vi.fn();
  return { prisma };
});

vi.mock("@/lib/mailer", () => ({
  emailDeliveryConfigured: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/server-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server-access")>()),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/domain-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domain-auth")>()),
  countDomainUsers: vi.fn().mockResolvedValue(0),
  createDomainAccount: vi.fn().mockResolvedValue({ ok: true, id: "d1" }),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  register: vi.fn().mockResolvedValue({ ok: true, user: { id: "a1" } }),
}));

import { prisma } from "@/lib/db";
import { emailDeliveryConfigured } from "@/lib/mailer";
import { requireUser } from "@/lib/server-access";
import { backupTables } from "@/lib/backup-tables";
import { setupTokenOk } from "@/lib/setup-token";
import { POST as forgotPOST } from "@/app/api/auth/forgot-password/route";
import { GET as backupGET, POST as backupPOST } from "@/app/api/admin/backup/route";
import { POST as signupPOST } from "@/app/api/auth/signup/route";
import { POST as bootstrapPOST } from "@/app/api/domain/auth/bootstrap/route";

const admin = { id: "adm", email: "a@x.com", name: "Admin", role: "Admin" as const, isAdmin: true };
const json = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("password-reset links in the Email log (E6)", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "dev@x.com", isActive: true } as never);
    vi.mocked(prisma.emailLog.create).mockClear();
  });

  const bodyLogged = () =>
    (vi.mocked(prisma.emailLog.create).mock.calls[0][0] as { data: { body: string } }).data.body;

  it("keeps the link in the log when no email can be sent — the admin forwards it", async () => {
    vi.mocked(emailDeliveryConfigured).mockResolvedValue(false);
    await forgotPOST(json("http://t/api/auth/forgot-password", { email: "dev@x.com" }));
    expect(bodyLogged()).toContain("/reset-password?token=");
  });

  it("leaves the link out of the log once SMTP is delivering", async () => {
    vi.mocked(emailDeliveryConfigured).mockResolvedValue(true);
    await forgotPOST(json("http://t/api/auth/forgot-password", { email: "dev2@x.com" }));
    expect(bodyLogged()).not.toContain("token=");
    expect(bodyLogged()).toMatch(/not stored here/);
  });
});

describe("JSON backup (E7)", () => {
  it("covers every persistent table in the schema", () => {
    const keys = backupTables().map((t) => t.model);
    const expected = Prisma.dmmf.datamodel.models
      .map((m) => m.name)
      .filter((n) => !["Session", "DomainSession", "PasswordResetToken"].includes(n));
    expect(keys.sort()).toEqual(expected.sort());
  });

  it("puts every table after the tables it references", () => {
    const order = backupTables().map((t) => t.model);
    for (const m of Prisma.dmmf.datamodel.models) {
      if (!order.includes(m.name)) continue;
      for (const f of m.fields) {
        if (f.kind === "object" && f.relationFromFields?.length && f.type !== m.name && order.includes(f.type)) {
          expect(order.indexOf(f.type)).toBeLessThan(order.indexOf(m.name));
        }
      }
    }
  });

  it("leaves password hashes out by default, and includes them on request", async () => {
    vi.mocked(requireUser).mockResolvedValue(admin as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u1", email: "a@x.com", passwordHash: "$2a$secret" }] as never);
    const plain = await (await backupGET(new Request("http://t/api/admin/backup"))).json();
    expect(plain.tables.user[0]).not.toHaveProperty("passwordHash");
    expect(plain.tables.user[0].email).toBe("a@x.com");
    const full = await (await backupGET(new Request("http://t/api/admin/backup?credentials=1"))).json();
    expect(full.tables.user[0].passwordHash).toBe("$2a$secret");
  });

  it("restores accounts from a hash-less backup with an unusable password", async () => {
    vi.mocked(requireUser).mockResolvedValue(admin as never);
    vi.mocked(prisma.user.createMany).mockClear();
    const res = await backupPOST(json("http://t/api/admin/backup", { tables: { user: [{ id: "u1", email: "a@x.com", name: "A" }] } }));
    expect(res.status).toBe(200);
    const rows = (vi.mocked(prisma.user.createMany).mock.calls[0][0] as { data: { passwordHash: string }[] }).data;
    expect(rows[0].passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

describe("first-admin setup token (E8)", () => {
  const saved = process.env.SETUP_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.SETUP_TOKEN;
    else process.env.SETUP_TOKEN = saved;
  });

  it("changes nothing when SETUP_TOKEN is not set", async () => {
    delete process.env.SETUP_TOKEN;
    expect(setupTokenOk(undefined)).toBe(true);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    const res = await signupPOST(json("http://t/api/auth/signup", { name: "A", email: "a@x.com", password: "Passw0rd!!" }));
    expect(res.status).toBe(200);
  });

  it("refuses the Tracker sign-up and the Engineering bootstrap without the token", async () => {
    process.env.SETUP_TOKEN = "s3cret-setup";
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    expect((await signupPOST(json("http://t/api/auth/signup", { name: "A", email: "a@x.com", password: "Passw0rd!!" }))).status).toBe(403);
    expect((await bootstrapPOST(json("http://t/api/domain/auth/bootstrap", { name: "A", email: "a@x.com", password: "Passw0rd!!", setupToken: "guess" }))).status).toBe(403);
  });

  it("accepts the right token", async () => {
    process.env.SETUP_TOKEN = "s3cret-setup";
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    expect((await signupPOST(json("http://t/api/auth/signup", { name: "A", email: "a@x.com", password: "Passw0rd!!", setupToken: "s3cret-setup" }))).status).toBe(200);
    expect((await bootstrapPOST(json("http://t/api/domain/auth/bootstrap", { name: "A", email: "a@x.com", password: "Passw0rd!!", setupToken: "s3cret-setup" }))).status).toBe(200);
  });
});
