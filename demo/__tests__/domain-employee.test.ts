import { describe, it, expect } from "vitest";
import {
  canEditEmployees,
  canReadEmployees,
  normaliseCode,
  parseEmployee,
  serializeEmployee,
} from "@/lib/domain-employee";
import { DOMAIN_ROLES } from "@/lib/domain";

/**
 * An employee is a person on the payroll; a DomainUser is a set of
 * credentials. These rules keep the two apart — nothing here requires a
 * login to exist.
 */

describe("who may touch the employee register", () => {
  it("supervisors read it", () => {
    expect(canReadEmployees("Admin")).toBe(true);
    expect(canReadEmployees("Lead")).toBe(true);
    expect(canReadEmployees("TeamLead")).toBe(true);
  });

  it("workers and a CEO do not", () => {
    expect(canReadEmployees("SME")).toBe(false);
    expect(canReadEmployees("Actionee")).toBe(false);
    expect(canReadEmployees("CEO")).toBe(false);
  });

  it("only Admin and Lead change it — a Team Lead reads only", () => {
    expect(canEditEmployees("Admin")).toBe(true);
    expect(canEditEmployees("Lead")).toBe(true);
    expect(canEditEmployees("TeamLead")).toBe(false);
    expect(canEditEmployees("SME")).toBe(false);
    expect(canEditEmployees("Actionee")).toBe(false);
    expect(canEditEmployees("CEO")).toBe(false);
  });

  it("every editor is also a reader — you cannot edit what you can't see", () => {
    for (const role of DOMAIN_ROLES) {
      if (canEditEmployees(role)) expect(canReadEmployees(role)).toBe(true);
    }
  });

  it("no role was added to make this work", () => {
    // The register is HR's, but HR is whoever holds Admin or Lead. A fifth
    // role would have to appear here first.
    expect(DOMAIN_ROLES).not.toContain("HR");
  });
});

describe("normaliseCode", () => {
  it("ignores case, spaces and dashes so one person can't be filed twice", () => {
    expect(normaliseCode("EMP01")).toBe("emp01");
    expect(normaliseCode("emp-01")).toBe("emp01");
    expect(normaliseCode("  Emp 01 ")).toBe("emp01");
  });

  it("is empty for nothing usable", () => {
    expect(normaliseCode("")).toBe("");
    expect(normaliseCode("  ")).toBe("");
    expect(normaliseCode(undefined)).toBe("");
    expect(normaliseCode(42)).toBe("");
  });
});

describe("parseEmployee", () => {
  const ok = { code: "EMP-014", name: "Asha Menon" };

  it("accepts a name and a code alone — HR files people on day one", () => {
    const r = parseEmployee(ok);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("Asha Menon");
    expect(r.value.code).toBe("EMP-014");
    // Everything unrecorded is null, not "" — an empty box is not a value.
    expect(r.value.designation).toBeNull();
    expect(r.value.department).toBeNull();
    expect(r.value.email).toBeNull();
    expect(r.value.phone).toBeNull();
    expect(r.value.location).toBeNull();
    expect(r.value.joinedOn).toBeNull();
  });

  it("requires a name", () => {
    const r = parseEmployee({ code: "EMP-1", name: "   " });
    expect(r).toEqual({ ok: false, error: "Name is required." });
  });

  it("requires a code", () => {
    const r = parseEmployee({ name: "Asha" });
    expect(r).toEqual({ ok: false, error: "Employee code is required." });
  });

  it("rejects a code made only of separators", () => {
    const r = parseEmployee({ name: "Asha", code: "- -" });
    expect(r.ok).toBe(false);
  });

  it("trims what it keeps", () => {
    const r = parseEmployee({ code: "  EMP-2  ", name: "  Asha  " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.code).toBe("EMP-2");
    expect(r.value.name).toBe("Asha");
  });

  it("accepts a blank email but refuses a malformed one", () => {
    expect(parseEmployee({ ...ok, email: "" }).ok).toBe(true);
    expect(parseEmployee({ ...ok, email: "   " }).ok).toBe(true);
    const bad = parseEmployee({ ...ok, email: "asha@" });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error).toContain("valid email");
  });

  it("reads a joining date and refuses a fake one", () => {
    const good = parseEmployee({ ...ok, joinedOn: "2026-04-01" });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.value.joinedOn?.toISOString().slice(0, 10)).toBe("2026-04-01");

    const bad = parseEmployee({ ...ok, joinedOn: "the fourth of never" });
    expect(bad).toEqual({ ok: false, error: "Joining date isn't a real date." });
  });

  it("treats a blank joining date as not recorded", () => {
    const r = parseEmployee({ ...ok, joinedOn: "" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.joinedOn).toBeNull();
  });

  it("never asks for a password or a role", () => {
    const r = parseEmployee({ ...ok, ...({ password: "x", role: "Admin" } as object) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).not.toHaveProperty("password");
    expect(r.value).not.toHaveProperty("role");
  });
});

describe("serializeEmployee", () => {
  const base = {
    id: 3,
    code: "EMP-014",
    name: "Asha Menon",
    designation: "QA Engineer",
    department: "Delivery",
    email: "asha@example.com",
    phone: null,
    location: null,
    joinedOn: new Date("2026-04-01T00:00:00Z"),
    isActive: true,
  };

  it("dates come back as plain days, not timestamps", () => {
    expect(serializeEmployee(base).joinedOn).toBe("2026-04-01");
  });

  it("an employee with no login reports no account", () => {
    expect(serializeEmployee(base).account).toBeNull();
    expect(serializeEmployee({ ...base, user: null }).account).toBeNull();
  });

  it("a linked account comes through without its password hash", () => {
    const row = serializeEmployee({
      ...base,
      user: { id: "u1", email: "asha@corp.com", role: "Actionee" },
    });
    expect(row.account).toEqual({
      id: "u1",
      email: "asha@corp.com",
      role: "Actionee",
    });
    expect(JSON.stringify(row)).not.toContain("passwordHash");
  });

  it("a missing joining date stays null", () => {
    expect(serializeEmployee({ ...base, joinedOn: null }).joinedOn).toBeNull();
  });
});
