# 01 — Overview

## What it is

An internal web app for Inventive Business Solutions, an engineering-services company. It started as a replacement for one shared Excel workbook and now runs two modules:

| Module | For | What it tracks | Login |
| --- | --- | --- | --- |
| **Tracker** | Everyone in the delivery and business teams | Clients, projects, tasks (assignment, status, approval, dependencies, forks), time logs, attachments, leaves, the sales pipeline, resource engagement and forecasts, monthly/yearly performance reviews | `/login` → Tracker tab |
| **Engineering** | The engineering delivery team (P&ID tagging and similar) | Projects and divisions, tag allocations, daily tag submissions and approvals, delivery corrections, Engineering tasks with reviewers, holidays and leave, forecast, resource availability, KPIs | `/login` → Engineering tab |

Both live in one Next.js app (`demo/`) on one Postgres database, but each has its own user table, session and roles.

## Why it exists

The workbook `assets/Ongoing_Projects.xlsx`, shared by 7 teams, had:

- concurrent edits overwriting each other;
- no notification when work was assigned, changed or overdue;
- no history of who changed what;
- a roll-up dashboard maintained by hand;
- inconsistent formats (efforts as `8 hrs`, `8`, `TBD`; dates as text or Excel serials);
- no access control.

The app fixes each: one record per task, notifications in-app and by email, an audit log on every change, automatic dashboards, normalised import, and server-enforced roles.

## The model it kept from the spreadsheet

```
Client
  └── Project  (roster: Lead, Co-ordinator, Developer, BD lanes)
        └── Task  (assignees, responsible person, priority, dates, status, remarks,
                   time entries, attachments, dependencies, approval)
```

Excel import (`/settings/import`, `/projects/[id]` → Import tasks) normalises the old sheets, and exports keep the column layout leadership is used to.

## Goals

- Everyone lands on the work that is theirs: `My Day` for Leads, Co-ordinators and HR, `My Tasks` for Developers; the org dashboard for Admins; the Engineering dashboard for that module.
- Nothing changes silently: notifications, audit log, approvals.
- Planning without a spreadsheet: resource engagement, project forecasts, availability.
- Reviews from evidence: performance reviews pull tasks, hours, leave and rework from the tracker.
- Safe to run: data survives every redeploy; every permission is checked on the server.

## Non-goals (current)

- Native mobile apps (the web app is responsive).
- SSO/SAML (open question — see [specs/09](../specs/09-build-plan.md)).
- Slack/Teams integration.
- Multi-tenant use outside Inventive.
