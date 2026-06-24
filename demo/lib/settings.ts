import { prisma } from "./db";

/**
 * Org-wide settings, server side. Backed by the single-row AppSettings
 * table; the row is created lazily with sensible defaults the first time
 * it's read.
 */

export type AppSettingsRow = {
  id: number;
  smtpFrom: string | null;
  workingHoursPerDay: number;
  workingDays: string;
  leaveTypes: string;
  annualLeaveQuota: number;
};

export async function getSettings(): Promise<AppSettingsRow> {
  const existing = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.appSettings.create({ data: { id: 1 } });
}

function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Settings with the CSV fields parsed into arrays, for callers that want
 *  lists (leave form, working-day math). */
export async function getSettingsParsed() {
  const s = await getSettings();
  return {
    smtpFrom: s.smtpFrom,
    workingHoursPerDay: s.workingHoursPerDay,
    workingDays: splitCsv(s.workingDays),
    leaveTypes: splitCsv(s.leaveTypes),
    annualLeaveQuota: s.annualLeaveQuota,
  };
}

export function serializeSettings(s: AppSettingsRow) {
  return {
    smtpFrom: s.smtpFrom ?? "",
    workingHoursPerDay: s.workingHoursPerDay,
    workingDays: splitCsv(s.workingDays),
    leaveTypes: splitCsv(s.leaveTypes),
    annualLeaveQuota: s.annualLeaveQuota,
  };
}

export const ALL_WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;