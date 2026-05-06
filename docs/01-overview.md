# 01 — Overview

## What we're building

A web-based work-tracking application called **Project Tracker** that replaces a multi-sheet Excel file currently used to track ongoing projects across 7 teams.

## Why we're building it

The Excel file (`Ongoing_Projects.xlsx`) has these problems:

- Concurrent edits cause data overwrites
- No notifications when work is assigned, edited, or overdue
- No history of who changed what
- Roll-up dashboard for important items must be hand-maintained
- Inconsistent formats: efforts written as `8 hrs`, `8`, `TBD`; dates as `16/03/2026` text or `46147` Excel serial
- No access control — anyone can edit anything
- Hard to filter "what's assigned to me" or "what's overdue this week"

## What it preserves from the old system

The mental model carries over directly:

```
Team (e.g., "Samanvay – Engg Memory")
  └── Project (e.g., "Saipem", "Luggi", "Thermax")
        └── Task (with priority, assignees, dates, status, remarks)
```

Existing column structure from the spreadsheet is preserved when exporting back to Excel, so leadership can still consume reports in the format they're used to.

## Existing teams (7) to be migrated

1. POCs
2. Support Automation
3. Thermax P&ID
4. Thermax ENIMAX
5. Thermax QA
6. Samanvay – Engg Memory
7. AMC

## Goals

- Lightweight, role-aware web app
- Three roles: Admin, Manager, User
- Task CRUD with status workflow
- "My Day" landing page for Manager and User
- Org dashboard (Admin) showing important tasks across all teams
- Audit log for every change
- Excel import (for migration) and export (for leadership reporting)
- Deployable as a single Docker stack on EC2 via Portainer

## Non-goals (explicitly out of scope for MVP)

- Gantt charts
- Sub-tasks or task dependencies
- Time-tracking / timesheet integration
- Slack / Teams integration
- Mobile app (responsive web is enough)
- SSO / SAML
- File attachments
- Customer-facing or external sharing

## Scale assumptions

- ~30 active users, 50 concurrent at peak
- ~500 active tasks at any time
- Single AWS EC2 instance (t3.medium or similar)
- Single Postgres database
- Daily backups to S3
