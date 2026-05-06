# CLAUDE.md — Instructions for Claude Code

This file is read automatically by Claude Code when invoked from the project root.

## Mission

Build the Project Tracker MVP described in this folder. Read the documents in the order specified in `README.md`. Do not begin coding until you've read them all.

## Hard rules

1. **Read all docs first** — `README.md` → `docs/01` → `docs/02` → `docs/03` → `docs/04` → `specs/05` → `specs/06` → `specs/07` → `specs/08` → `specs/09` → `specs/10`. Don't skip.
2. **Follow the build plan in `specs/09-build-plan.md`** phase by phase. Don't try to build everything at once.
3. **Three roles only**: Admin (global), Manager (per-team), User (per-team). Do not introduce more roles.
4. **Server-side enforcement** for every permission check. Never trust the client.
5. **Match the visual style** in `docs/04-screens.md` and `assets/demo.html`. Google color palette. Space Grotesk for headings. Poppins for body.
6. **Use the tech stack in `specs/07-tech-stack.md`**. Don't substitute frameworks without an explicit reason.
7. **Both Manager and User land on `/my-day`** — not on a team board, not on a generic dashboard.
8. **Test the import using `assets/Ongoing_Projects.xlsx`** — this is the real data the system has to handle.

## How I want you to work

- Work phase by phase from `specs/09-build-plan.md`. After each phase, summarize what's built, run the relevant tests, and ask before proceeding.
- For every endpoint you add, write a permission test that asserts the wrong role gets `403`.
- For every UI page you add, take a moment to compare to the visual style guide and fix anything that drifts.
- Commit messages: imperative, concise. Phase number prefixes welcome (e.g., `[P2] add task drawer`).
- When unsure, prefer the simpler implementation. This is an MVP, not a platform.

## Project root layout to create

See `specs/07-tech-stack.md` "Repository structure" section.

## Environment

- Local dev: `docker compose up`, app available on `http://localhost`
- Backend hot reload via uvicorn `--reload`
- Frontend hot reload via Vite dev server (proxy `/api/*` to backend)

## What's already provided in this folder

- **Real source data** in `assets/Ongoing_Projects.xlsx` — use this for import testing
- **Visual reference** in `assets/demo.html` — open in a browser to see the target look and feel
- **Full PRD** in `docs/` and `specs/`

## What I expect at the end

A working Docker Compose stack that:
1. Runs locally with `docker compose up`
2. Deploys to AWS EC2 via Portainer with no manual intervention beyond setting env vars
3. Imports the real `Ongoing_Projects.xlsx` end-to-end
4. Passes every checkbox in `specs/10-acceptance-criteria.md`

## Things you should NOT do

- Don't add features beyond MVP scope (see `docs/01-overview.md` non-goals)
- Don't add Celery, Kubernetes, microservices, GraphQL, or other complexity
- Don't introduce a fourth role
- Don't use JWT (use server sessions, simpler to revoke)
- Don't build a mobile app (responsive web is enough)
- Don't reproduce the spreadsheet's data quirks; normalize them on import

## When you finish a phase

Run through these checks before moving on:
1. The phase's "Done when" criteria from `specs/09-build-plan.md` are met
2. New endpoints have passing permission tests
3. New UI matches the visual style
4. Stack still boots cleanly via `docker compose up`
5. Summarize what was built and ask before starting the next phase
