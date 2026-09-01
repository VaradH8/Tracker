import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { DomainRole } from "@/lib/domain";

vi.mock("@/lib/db", () => ({
  prisma: {
    domainEmployee: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    domainUser: { findUnique: vi.fn() },
  },
}));

/* The role ladder keeps its real semantics; only the session is faked. */
vi.mock("@/lib/domain-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain-auth")>(
    "@/lib/domain-auth",
  );
  return { ...actual, requireDomainUser: vi.fn() };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import {
  GET as employeesGET,
  POST as employeesPOST,
} from "@/app/api/domain/employees/route";
import {
  PATCH as employeePATCH,
  DELETE as employeeDELETE,
} from "@/app/api/domain/employees/[id]/route";

function actor(role: DomainRole) {
  // taskLogOnly is a sidebar preference, never a permission — see
  // api/domain/me/preferences. It is on the session user, so it has to be
  // here, and false is what every route under test should see.
  return {
    id: `u-${role}`,
    name: role,
    email: `${role}@x.com`,
    role,
    taskLogOnly: false,
  };
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postReq(body: Record<string, unknown>) {
  return new Request("http://t/api/domain/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchReq(id: string, body: Record<string, unknown>) {
  return new Request(`http://t/api/domain/employees/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ROW = {
  id: 3,
  code: "EMP-014",
  name: "Asha Menon",
  designation: null,
  department: null,
  email: null,
  phone: null,
  location: null,
  joinedOn: null,
  isActive: true,
  user: null,
};

beforeEach(() => {
  vi.mocked(requireDomainUser).mockReset();
  vi.mocked(prisma.domainEmployee.findMany).mockReset();
  vi.mocked(prisma.domainEmployee.findUnique).mockReset();
  vi.mocked(prisma.domainEmployee.create).mockReset();
  vi.mocked(prisma.domainEmployee.update).mockReset();
  vi.mocked(prisma.domainEmployee.delete).mockReset();
  vi.mocked(prisma.domainUser.findUnique).mockReset();
});

describe("GET /api/domain/employees", () => {
  it("401 when signed out", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await employeesGET()).status).toBe(401);
  });

  it.each(["SME", "Actionee", "CEO"] as DomainRole[])(
    "403 for %s — staff records are not theirs to read",
    async (role) => {
      vi.mocked(requireDomainUser).mockResolvedValue(actor(role));
      const res = await employeesGET();
      expect(res.status).toBe(403);
      expect(prisma.domainEmployee.findMany).not.toHaveBeenCalled();
    },
  );

  it.each(["Admin", "Lead", "TeamLead"] as DomainRole[])(
    "200 for %s",
    async (role) => {
      vi.mocked(requireDomainUser).mockResolvedValue(actor(role));
      vi.mocked(prisma.domainEmployee.findMany).mockResolvedValue([ROW] as never);
      const res = await employeesGET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.employees[0].code).toBe("EMP-014");
    },
  );
});

describe("POST /api/domain/employees", () => {
  it.each(["TeamLead", "SME", "Actionee", "CEO"] as DomainRole[])(
    "403 for %s — only Admin/Lead open a record",
    async (role) => {
      vi.mocked(requireDomainUser).mockResolvedValue(actor(role));
      const res = await employeesPOST(postReq({ code: "E1", name: "Asha" }));
      expect(res.status).toBe(403);
      expect(prisma.domainEmployee.create).not.toHaveBeenCalled();
    },
  );

  it("400 with no name", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Lead"));
    const res = await employeesPOST(postReq({ code: "E1" }));
    expect(res.status).toBe(400);
    expect(prisma.domainEmployee.create).not.toHaveBeenCalled();
  });

  it("400 when the code is already in use, ignoring case and dashes", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Lead"));
    vi.mocked(prisma.domainEmployee.findMany).mockResolvedValue([
      { id: 1, code: "EMP-014" },
    ] as never);
    const res = await employeesPOST(postReq({ code: "emp014", name: "Someone" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("already in use");
    expect(prisma.domainEmployee.create).not.toHaveBeenCalled();
  });

  it("201 and stores no credentials", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Lead"));
    vi.mocked(prisma.domainEmployee.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.domainEmployee.create).mockResolvedValue(ROW as never);
    const res = await employeesPOST(
      postReq({
        code: "EMP-014",
        name: "Asha Menon",
        // Sent by a confused client; must be ignored, not honoured.
        password: "hunter2hunter2",
        role: "Admin",
        userId: "u-someone",
      }),
    );
    expect(res.status).toBe(201);
    const data = vi.mocked(prisma.domainEmployee.create).mock.calls[0][0]
      .data as Record<string, unknown>;
    expect(data).not.toHaveProperty("password");
    expect(data).not.toHaveProperty("passwordHash");
    expect(data).not.toHaveProperty("role");
    // A login is attached deliberately via PATCH, never smuggled in on create.
    expect(data).not.toHaveProperty("userId");
  });
});

describe("PATCH /api/domain/employees/[id]", () => {
  it.each(["TeamLead", "SME", "Actionee", "CEO"] as DomainRole[])(
    "403 for %s",
    async (role) => {
      vi.mocked(requireDomainUser).mockResolvedValue(actor(role));
      const res = await employeePATCH(patchReq("3", { name: "X" }), params("3"));
      expect(res.status).toBe(403);
      expect(prisma.domainEmployee.update).not.toHaveBeenCalled();
    },
  );

  it("404 for an employee that isn't there", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(null);
    const res = await employeePATCH(patchReq("3", { name: "X" }), params("3"));
    expect(res.status).toBe(404);
  });

  it("deactivates without deleting — HR keeps the record of who worked here", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(ROW as never);
    vi.mocked(prisma.domainEmployee.update).mockResolvedValue({
      ...ROW,
      isActive: false,
    } as never);
    const res = await employeePATCH(
      patchReq("3", { isActive: false }),
      params("3"),
    );
    expect(res.status).toBe(200);
    expect(prisma.domainEmployee.delete).not.toHaveBeenCalled();
    const data = vi.mocked(prisma.domainEmployee.update).mock.calls[0][0]
      .data as Record<string, unknown>;
    expect(data).toEqual({ isActive: false });
  });

  it("400 linking an account that doesn't exist", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(ROW as never);
    vi.mocked(prisma.domainUser.findUnique).mockResolvedValue(null);
    const res = await employeePATCH(
      patchReq("3", { userId: "nope" }),
      params("3"),
    );
    expect(res.status).toBe(400);
    expect(prisma.domainEmployee.update).not.toHaveBeenCalled();
  });

  it("400 linking an account that already belongs to someone else", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(ROW as never);
    vi.mocked(prisma.domainUser.findUnique).mockResolvedValue({
      id: "u1",
      employee: { id: 99 },
    } as never);
    const res = await employeePATCH(patchReq("3", { userId: "u1" }), params("3"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("already linked");
  });

  it("detaches a login with null, leaving the employee in place", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(ROW as never);
    vi.mocked(prisma.domainEmployee.update).mockResolvedValue(ROW as never);
    const res = await employeePATCH(patchReq("3", { userId: null }), params("3"));
    expect(res.status).toBe(200);
    const data = vi.mocked(prisma.domainEmployee.update).mock.calls[0][0]
      .data as Record<string, unknown>;
    expect(data).toEqual({ userId: null });
    expect(prisma.domainUser.findUnique).not.toHaveBeenCalled();
  });

  it("400 on an empty patch rather than a pointless write", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(ROW as never);
    const res = await employeePATCH(patchReq("3", {}), params("3"));
    expect(res.status).toBe(400);
    expect(prisma.domainEmployee.update).not.toHaveBeenCalled();
  });

  it("400 when an edit would collide with another person's code", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(ROW as never);
    vi.mocked(prisma.domainEmployee.findMany).mockResolvedValue([
      { id: 3, code: "EMP-014" },
      { id: 8, code: "EMP-015" },
    ] as never);
    const res = await employeePATCH(
      patchReq("3", { code: "emp 015" }),
      params("3"),
    );
    expect(res.status).toBe(400);
    expect(prisma.domainEmployee.update).not.toHaveBeenCalled();
  });

  it("allows an employee to keep their own code on an unrelated edit", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(ROW as never);
    vi.mocked(prisma.domainEmployee.findMany).mockResolvedValue([
      { id: 3, code: "EMP-014" },
    ] as never);
    vi.mocked(prisma.domainEmployee.update).mockResolvedValue(ROW as never);
    const res = await employeePATCH(
      patchReq("3", { designation: "QA Engineer" }),
      params("3"),
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/domain/employees/[id]", () => {
  it.each(["TeamLead", "SME", "Actionee", "CEO"] as DomainRole[])(
    "403 for %s",
    async (role) => {
      vi.mocked(requireDomainUser).mockResolvedValue(actor(role));
      const res = await employeeDELETE(new Request("http://t"), params("3"));
      expect(res.status).toBe(403);
      expect(prisma.domainEmployee.delete).not.toHaveBeenCalled();
    },
  );

  it("404 when it isn't there", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue(null);
    const res = await employeeDELETE(new Request("http://t"), params("3"));
    expect(res.status).toBe(404);
    expect(prisma.domainEmployee.delete).not.toHaveBeenCalled();
  });

  it("removes the record and never the linked account", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainEmployee.findUnique).mockResolvedValue({
      ...ROW,
      userId: "u1",
    } as never);
    vi.mocked(prisma.domainEmployee.delete).mockResolvedValue(ROW as never);
    const res = await employeeDELETE(new Request("http://t"), params("3"));
    expect(res.status).toBe(200);
    expect(prisma.domainEmployee.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(prisma.domainUser.findUnique).not.toHaveBeenCalled();
  });
});
