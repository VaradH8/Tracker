import type { DomainRole } from "./domain";

/**
 * Employee records — the HR side of People.
 *
 * An employee is a person on the payroll. A DomainUser is a set of
 * credentials. Most employees have no account, and the two are linked only
 * when somebody actually needs to sign in, so nothing here assumes a login
 * exists.
 *
 * Validation lives in this module rather than inline in the route so it can
 * be unit-tested without a database, the way the rest of the module's rules
 * are.
 */

export type EmployeeInput = {
  code?: unknown;
  name?: unknown;
  designation?: unknown;
  department?: unknown;
  email?: unknown;
  phone?: unknown;
  location?: unknown;
  joinedOn?: unknown;
};

export type EmployeeFields = {
  code: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  joinedOn: Date | null;
};

/** Who may see the employee register: the same supervisors who already run
 *  the People page. Nobody below that has business reading staff records. */
export const EMPLOYEE_READERS: DomainRole[] = ["Admin", "Lead", "TeamLead"];

/** Who may add, edit or remove an employee. Mirrors the rule for accounts:
 *  a Team Lead manages the people they oversee but does not open or close
 *  records, so the register is Admin/Lead. "HR" is whoever holds one of
 *  those — the module has no separate HR role and does not need one. */
export const EMPLOYEE_EDITORS: DomainRole[] = ["Admin", "Lead"];

export function canReadEmployees(role: DomainRole): boolean {
  return EMPLOYEE_READERS.includes(role);
}

export function canEditEmployees(role: DomainRole): boolean {
  return EMPLOYEE_EDITORS.includes(role);
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Optional text: an empty box means "not recorded", which is null, not "". */
const optional = (v: unknown): string | null => str(v) || null;

/** Employee codes are compared case- and space-insensitively so "emp 01",
 *  "EMP01" and "Emp-01" cannot all be filed as different people. The stored
 *  value keeps whatever HR typed; only the comparison is normalised. */
export function normaliseCode(code: unknown): string {
  return str(code).toLowerCase().replace(/[\s-]+/g, "");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate and normalise an employee payload.
 *
 * Only name and code are required. Everything else is genuinely optional —
 * HR often files somebody on their first morning with nothing but a name and
 * a staff number, and refusing that would push them back to a spreadsheet.
 */
export function parseEmployee(
  input: EmployeeInput,
): { ok: true; value: EmployeeFields } | { ok: false; error: string } {
  const name = str(input.name);
  if (!name) return { ok: false, error: "Name is required." };

  const code = str(input.code);
  if (!code) return { ok: false, error: "Employee code is required." };
  if (!normaliseCode(code)) {
    return { ok: false, error: "Employee code needs at least one character." };
  }

  const email = optional(input.email);
  if (email && !EMAIL.test(email)) {
    return { ok: false, error: "Enter a valid email address, or leave it blank." };
  }

  let joinedOn: Date | null = null;
  if (input.joinedOn !== undefined && input.joinedOn !== null && str(input.joinedOn)) {
    const d = new Date(str(input.joinedOn));
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Joining date isn't a real date." };
    }
    joinedOn = d;
  }

  return {
    ok: true,
    value: {
      code,
      name,
      designation: optional(input.designation),
      department: optional(input.department),
      email,
      phone: optional(input.phone),
      location: optional(input.location),
      joinedOn,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

export type EmployeeRow = {
  id: number;
  code: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  joinedOn: string | null;
  isActive: boolean;
  /** The login account attached to this person, where there is one. */
  account: { id: string; email: string; role: string } | null;
};

type PrismaEmployee = {
  id: number;
  code: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  joinedOn: Date | null;
  isActive: boolean;
  user?: { id: string; email: string; role: string } | null;
};

export function serializeEmployee(e: PrismaEmployee): EmployeeRow {
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    designation: e.designation,
    department: e.department,
    email: e.email,
    phone: e.phone,
    location: e.location,
    joinedOn: e.joinedOn ? e.joinedOn.toISOString().slice(0, 10) : null,
    isActive: e.isActive,
    account: e.user ? { id: e.user.id, email: e.user.email, role: e.user.role } : null,
  };
}
