# Project Tracker — Build Package

This folder contains everything needed to build the Project Tracker MVP. Read documents in this order:

## Reading order

1. **[README.md](./README.md)** ← you are here
2. **[docs/01-overview.md](./docs/01-overview.md)** — what we're building and why
3. **[docs/02-roles-and-permissions.md](./docs/02-roles-and-permissions.md)** — the 3 roles, what each can/can't do
4. **[docs/03-workflows.md](./docs/03-workflows.md)** — step-by-step flow per role (login → actions)
5. **[docs/04-screens.md](./docs/04-screens.md)** — every screen, what's on it, by role
6. **[specs/05-data-model.md](./specs/05-data-model.md)** — database tables, fields, relationships
7. **[specs/06-api-spec.md](./specs/06-api-spec.md)** — REST endpoints
8. **[specs/07-tech-stack.md](./specs/07-tech-stack.md)** — frameworks, libraries, versions
9. **[specs/08-deployment.md](./specs/08-deployment.md)** — Docker, Portainer, EC2 setup
10. **[specs/09-build-plan.md](./specs/09-build-plan.md)** — phased delivery, milestone-by-milestone
11. **[specs/10-acceptance-criteria.md](./specs/10-acceptance-criteria.md)** — definition of done

## For Claude Code

When invoked from the project root:

- **First task**: read the documents in the order above before writing any code
- **Source xlsx file** for import testing: `assets/Ongoing_Projects.xlsx`
- **HTML mockup** showing the UI direction: `assets/demo.html` — match the visual style (Google color palette, Space Grotesk for headings, Poppins for body)
- **Build environment**: a single AWS EC2 instance running Docker + Portainer
- **Database**: PostgreSQL 16
- **Auth**: email + password, session cookies
- **Three roles only**: Admin (global), Manager (per-team), User (per-team)

## Project name

`project-tracker`

## Quick summary (TL;DR for the model)

A web app to replace a multi-sheet Excel tracker. Teams (e.g., Samanvay, Thermax P&ID) contain Projects, which contain Tasks. Tasks have priority, assignees, dates, status (To Do / In Progress / Blocked / Done), and a Manager-controlled "Important" flag that surfaces them on a cross-team Admin dashboard. Manager and User both land on a "My Day" dashboard on login. Admin lands on an org-wide dashboard.

Build it lean. MVP scope is in `specs/09-build-plan.md`. Don't over-engineer.
