import { describe, it, expect } from "vitest";
import { workingDaySet } from "@/lib/engagement";
import {
  band,
  buildReport,
  computeMetrics,
  expectedOutcome,
  inPeriod,
  periodRange,
  statusAsOf,
  type ReportFacts,
  type TaskFact,
} from "@/lib/performance/report";
import {
  INPUT_KEY,
  isEmployeeKey,
  isValidPeriod,
  levelFor,
  mergeInputs,
  parseReviewQuery,
  validateChanges,
} from "@/lib/performance/forms";
import { isLongTerm, overdueDaysAsOf, taskStatusAsOf, toSelfView } from "@/lib/performance/report";

const WORK = workingDaySet(["Mon", "Tue", "Wed", "Thu", "Fri"]);

let nextId = 1;
function task(over: Partial<TaskFact> = {}): TaskFact {
  return {
    id: nextId++,
    title: `Task ${nextId}`,
    description: null,
    projectName: "TEI-SUIT",
    priority: "Medium",
    status: "To Do",
    important: false,
    startDate: "2026-09-01",
    targetDate: "2026-09-20",
    createdAt: "2026-09-01",
    completedAt: null,
    estimatedHours: null,
    actualHours: null,
    reopenCount: 0,
    approved: false,
    logged: 0,
    coAssignees: 0,
    ...over,
  };
}

function facts(over: Partial<ReportFacts> = {}): ReportFacts {
  return {
    kind: "Monthly",
    period: "2026-09",
    today: "2026-10-06",
    employee: {
      id: "u1",
      name: "Sanjana Shinde",
      employeeCode: "IBS-042",
      department: "Engineering",
      designation: "Developer",
      joined: "2024-06-01",
      reportingManager: "Rahul Lead",
    },
    tasks: [],
    entries: [],
    leaves: [],
    remarks: 0,
    workDays: WORK,
    hoursPerDay: 8,
    ...over,
  };
}

describe("periods", () => {
  it("covers whole months (incl. leap February) and calendar years", () => {
    expect(periodRange("Monthly", "2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("Monthly", "2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodRange("Yearly", "2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("validates kind/period pairs", () => {
    expect(isValidPeriod("Monthly", "2026-09")).toBe(true);
    expect(isValidPeriod("Monthly", "2026-13")).toBe(false);
    expect(isValidPeriod("Yearly", "2026")).toBe(true);
    expect(isValidPeriod("Yearly", "2026-01")).toBe(false);
    expect(parseReviewQuery({ userId: "u", kind: "monthly", period: "2026-09" })).toEqual({
      userId: "u",
      kind: "Monthly",
      period: "2026-09",
    });
    expect(parseReviewQuery({ userId: "", kind: "Monthly", period: "2026-09" })).toBeNull();
  });
});

describe("task scoping and status", () => {
  it("drops work finished before the period and work not yet started", () => {
    const before = task({ status: "Done", completedAt: "2026-08-28" });
    const after = task({ startDate: "2026-10-02" });
    const open = task({ startDate: "2026-07-01", targetDate: "2026-12-01" });
    expect(inPeriod(before, "2026-09-01", "2026-09-30")).toBe(false);
    expect(inPeriod(after, "2026-09-01", "2026-09-30")).toBe(false);
    expect(inPeriod(open, "2026-09-01", "2026-09-30")).toBe(true);
  });

  it("reads status as of the period end, not today", () => {
    const finishedLater = task({ status: "Done", completedAt: "2026-10-03", targetDate: "2026-10-10" });
    expect(statusAsOf(finishedLater, "2026-09-30")).toBe("In Progress");
    const late = task({ status: "In Progress", targetDate: "2026-09-15" });
    expect(statusAsOf(late, "2026-09-30")).toBe("Delayed");
    expect(statusAsOf(task({ status: "Done", completedAt: "2026-09-10" }), "2026-09-30")).toBe("Completed");
  });

  it("uses the first line of a commit-log description as the expected outcome", () => {
    expect(
      expectedOutcome("• 21-Sep-2026 | TEI BE 4ba5037: End User field added\n• second line"),
    ).toBe("TEI BE 4ba5037: End User field added");
  });
});

describe("metrics", () => {
  it("computes completion, on-time, utilization and leave", () => {
    const f = facts({
      tasks: [
        task({ id: 1, status: "Done", completedAt: "2026-09-10", targetDate: "2026-09-12", estimatedHours: 10, logged: 10 }),
        task({ id: 2, projectName: "Other", status: "Done", completedAt: "2026-09-25", targetDate: "2026-09-20", estimatedHours: 10, logged: 20 }),
        task({ status: "In Progress", targetDate: "2026-09-18" }),
        task({ status: "To Do", targetDate: "2026-10-20" }),
      ],
      entries: [
        { taskId: 1, projectName: "TEI-SUIT", date: "2026-09-02", hours: 60 },
        { taskId: 2, projectName: "Other", date: "2026-09-03", hours: 20 },
      ],
      // Mon 7 – Tue 8 Sep sick, plus a weekend day that mustn't count.
      leaves: [{ start: "2026-09-05", end: "2026-09-08", type: "Sick Leave" }],
    });
    const m = computeMetrics(f, "2026-09-01", "2026-09-30", "2026-09-30");
    expect(m.workingDays).toBe(22);
    expect(m.leaveDays).toBe(2);
    expect(m.unplannedLeaveDays).toBe(2);
    expect(m.capacityHours).toBe(160); // (22 − 2) × 8
    expect(m.hoursLogged).toBe(80);
    expect(m.utilization).toBe(50);
    expect(m.tasksCompleted).toBe(2);
    expect(m.completionRate).toBe(67); // 2 of 3 due/finished
    expect(m.onTimeRate).toBe(50);
    expect(m.estimateAccuracy).toBe(67); // 20 est vs 30 actual
    expect(m.overdueOpen).toBe(1);
    expect(m.projects[0]).toEqual({ name: "TEI-SUIT", hours: 60, tasks: 1 });
  });

  it("treats a period with no time logged as untracked, not 0% utilization", () => {
    const f = facts({ tasks: [task({ status: "Done", completedAt: "2026-09-10" })] });
    const m = computeMetrics(f, "2026-09-01", "2026-09-30", "2026-09-30");
    expect(m.utilization).toBeNull();
    const r = buildReport(f, {});
    const productivity = r.areas.find((a) => a.key === "productivity")!;
    expect(productivity.evidence).toContain("No time logged");
    // 100% completion alone can't make "Exceptional".
    expect(productivity.system).toBe(4);
  });

  it("bands values into 1–5", () => {
    expect(band(95, [90, 75, 60, 40])).toBe(5);
    expect(band(60, [90, 75, 60, 40])).toBe(3);
    expect(band(10, [90, 75, 60, 40])).toBe(1);
    expect(band(null, [90, 75, 60, 40])).toBeNull();
    expect(levelFor(3.4)).toBe("Meets Expectations");
    expect(levelFor(4.6)).toBe("Exceptional");
  });
});

describe("buildReport — monthly", () => {
  const f = facts({
    tasks: [
      task({ id: 101, title: "ESP half vibrator", status: "Done", completedAt: "2026-09-23", targetDate: "2026-09-23", priority: "High", approved: true }),
      task({ id: 102, title: "Plant 3D migration", status: "In Progress", startDate: "2026-08-01", targetDate: "2026-11-30", estimatedHours: 100, logged: 30, important: true }),
    ],
    entries: [{ taskId: 101, projectName: "TEI-SUIT", date: "2026-09-23", hours: 150 }],
    remarks: 4,
  });

  it("fills the task tables from the tracker", () => {
    const r = buildReport(f, {});
    expect(r.goals.map((g) => g.title)).toEqual(["ESP half vibrator", "Plant 3D migration"]);
    expect(r.goals[0].status).toBe("Completed");
    expect(r.longTerm).toHaveLength(1);
    const lt = r.longTerm[0];
    expect(lt.taskId).toBe(102);
    expect(lt.actual).toBe(30);
    expect(lt.planned).toBe(50); // 60 of 121 days elapsed by 30 Sep
    expect(lt.status).toBe("At Risk");
  });

  it("suggests ratings only where data measures the area", () => {
    const r = buildReport(f, {});
    const by = Object.fromEntries(r.areas.map((a) => [a.key, a]));
    expect(by.quality.system).toBe(5); // no rework + all signed off
    expect(by.knowledge.system).toBeNull();
    expect(by.communication.system).toBeNull();
    expect(by.communication.evidence).toContain("4 remark");
    expect(r.summary.overall).not.toBeNull();
    expect(r.summary.level).toBe(levelFor(r.summary.overall));
  });

  it("never generates the employee's self-assessment", () => {
    const r = buildReport(f, {});
    expect(r.self.every((s) => s.value === "" && s.suggested === "")).toBe(true);
    expect(r.manager.find((m) => m.key === "mgr.achievements")?.suggested).toContain("ESP half vibrator");
  });

  it("lets saved inputs override suggestions", () => {
    const r = buildReport(f, {
      "rating.quality.manager": "2",
      "rating.quality.employee": "4",
      "summary.overall": "3.5",
      "summary.level": "Needs Improvement",
      "mgr.achievements": "Shipped the ESP change spec.",
      "milestone.102": "Pilot plant migrated",
      reviewDate: "2026-10-05",
    });
    const q = r.areas.find((a) => a.key === "quality")!;
    expect(q.effective).toBe(2);
    expect(q.employee).toBe(4);
    expect(r.summary.overall).toBe(3.5);
    expect(r.summary.level).toBe("Needs Improvement");
    expect(r.summary.levelEntered).toBe(true);
    expect(r.manager[0].value).toBe("Shipped the ESP change spec.");
    expect(r.longTerm[0].milestone.value).toBe("Pilot plant migrated");
    expect(r.reviewDate).toBe("2026-10-05");
  });
});

describe("buildReport — yearly", () => {
  it("builds KPI rows, manual goals and rolls up monthly ratings", () => {
    const r = buildReport(
      facts({
        kind: "Yearly",
        period: "2026",
        tasks: [
          task({ status: "Done", completedAt: "2026-03-10", targetDate: "2026-03-12", important: true }),
          task({ status: "Done", completedAt: "2026-07-01", targetDate: "2026-06-20" }),
        ],
        monthly: [
          { period: "2026-08", ratings: { quality: 4, communication: 3 } },
          { period: "2026-09", ratings: { quality: 3, communication: 3 } },
        ],
      }),
      { "goal.1.goal": "AWS certification", "goal.1.achievement": "100" },
    );
    expect(r.kpis.map((k) => k.key)).toEqual(["completion", "onTime", "utilization", "estimate", "critical", "goal.1"]);
    expect(r.kpis.find((k) => k.key === "onTime")?.achievement).toBe(56); // 50% vs 90% target
    expect(r.kpis.find((k) => k.key === "goal.1")?.manual).toBe(true);
    const comm = r.areas.find((a) => a.key === "communication")!;
    expect(comm.system).toBe(3);
    expect(comm.evidence).toContain("avg 3 over 2 month(s)");
    expect(r.summary.priority).not.toBeNull();
    expect(r.manager.find((m) => m.key === "mgr.consistency")?.suggested).toContain("Aug 3.5");
  });
});

describe("input keys", () => {
  it("accepts form fields and rejects anything else", () => {
    for (const k of ["rating.quality.manager", "self.achievements", "summary.plan", "milestone.12", "goal.3.actual", "ach.team.manager", "reviewDate"]) {
      expect(INPUT_KEY.test(k)).toBe(true);
    }
    for (const k of ["__proto__", "rating.quality", "goal.9.goal", "summary.hack", "milestone.x"]) {
      expect(INPUT_KEY.test(k)).toBe(false);
    }
  });
});

describe("employee fields", () => {
  it("are only the employee's own half of the form", () => {
    for (const k of ["rating.quality.employee", "self.challenges", "ach.team.employee", "summary.employeeComments"]) {
      expect(isEmployeeKey(k)).toBe(true);
    }
    for (const k of ["rating.quality.manager", "rating.quality.comments", "mgr.strengths", "summary.overall", "summary.level", "milestone.4", "reviewDate"]) {
      expect(isEmployeeKey(k)).toBe(false);
    }
  });

  it("validates and merges change sets", () => {
    expect(validateChanges({ "rating.quality.employee": " 4 " })).toEqual({ ok: true, changes: { "rating.quality.employee": "4" } });
    expect(validateChanges({ "rating.quality.employee": "0" }).ok).toBe(false);
    expect(validateChanges({ "mgr.strengths": "x" }, isEmployeeKey).ok).toBe(false);
    expect(isEmployeeKey("summary.commentTo")).toBe(true);
    expect(validateChanges({ "summary.commentTo": "hr" }, isEmployeeKey).ok).toBe(true);
    expect(validateChanges({ "summary.commentTo": "ceo" }, isEmployeeKey).ok).toBe(false);
    expect(mergeInputs({ a: "1", b: "2" }, { b: "", c: "3" })).toEqual({ a: "1", c: "3" });
  });

  it("the self view drops manager ratings, comments and suggestions", () => {
    const r = buildReport(facts({ tasks: [task({ status: "Done", completedAt: "2026-09-10" })] }), {
      "rating.quality.manager": "2",
      "rating.quality.employee": "4",
      "mgr.strengths": "secret",
      "summary.employeeComments": "thanks",
    });
    const v = toSelfView(r);
    expect(v.areas.find((a) => a.key === "quality")).toEqual({
      key: "quality",
      label: "Quality of Work",
      evidence: expect.any(String),
      employee: 4,
    });
    expect(JSON.stringify(v)).not.toContain("secret");
    expect(v.employeeComments.value).toBe("thanks");
  });
});

describe("task status as My Tasks shows it", () => {
  it("reports the tracker status and days overdue at the period end", () => {
    const blocked = task({ id: 501, status: "Blocked", targetDate: "2026-09-04" });
    const doneLater = task({ id: 502, status: "Done", completedAt: "2026-10-03", targetDate: "2026-09-20" });
    const doneInTime = task({ id: 503, status: "Done", completedAt: "2026-09-10", targetDate: "2026-09-12" });
    expect(taskStatusAsOf(blocked, "2026-09-30")).toBe("Blocked");
    expect(overdueDaysAsOf(blocked, "2026-09-30")).toBe(26);
    // Finished after the month: still open (and late) at its end.
    expect(taskStatusAsOf(doneLater, "2026-09-30")).toBe("In Progress");
    expect(overdueDaysAsOf(doneLater, "2026-09-30")).toBe(10);
    expect(taskStatusAsOf(doneInTime, "2026-09-30")).toBe("Done");
    expect(overdueDaysAsOf(doneInTime, "2026-09-30")).toBeNull();

    const r = buildReport(facts({ tasks: [blocked, doneInTime] }), {});
    expect(r.goals.find((g) => g.taskId === 501)).toMatchObject({ status: "Delayed", taskStatus: "Blocked", overdueDays: 26 });
    expect(toSelfView(r).goals.find((g) => g.taskId === 503)).toMatchObject({ taskStatus: "Done", overdueDays: null });
  });
});

describe("critical / long-term tasks", () => {
  const FROM = "2026-09-01";
  const TO = "2026-09-30";
  it("counts critical work and anything extending beyond the month", () => {
    // Imported in September with no start date, due back in May: carried over.
    expect(isLongTerm(task({ startDate: null, createdAt: "2026-09-17", targetDate: "2026-05-04" }), FROM, TO)).toBe(true);
    expect(isLongTerm(task({ startDate: "2026-08-20", targetDate: "2026-09-10" }), FROM, TO)).toBe(true); // started earlier
    expect(isLongTerm(task({ startDate: "2026-09-05", targetDate: "2026-10-15" }), FROM, TO)).toBe(true); // due later
    expect(isLongTerm(task({ priority: "Critical", startDate: "2026-09-05", targetDate: "2026-09-10" }), FROM, TO)).toBe(true);
    expect(isLongTerm(task({ important: true, startDate: "2026-09-05", targetDate: "2026-09-10" }), FROM, TO)).toBe(true);
    // Started and due inside the month: an ordinary monthly task.
    expect(isLongTerm(task({ startDate: "2026-09-05", targetDate: "2026-09-20" }), FROM, TO)).toBe(false);
    expect(isLongTerm(task({ startDate: null, createdAt: "2026-09-17", targetDate: null }), FROM, TO)).toBe(false);
  });

  it("lists carried-over overdue work in section 3", () => {
    const r = buildReport(
      facts({ tasks: [task({ id: 601, startDate: null, createdAt: "2026-09-17", targetDate: "2026-05-04", status: "Blocked" })] }),
      {},
    );
    expect(r.longTerm.map((l) => l.taskId)).toEqual([601]);
    expect(r.longTerm[0]).toMatchObject({ status: "Delayed", taskStatus: "Blocked" });
  });
});
