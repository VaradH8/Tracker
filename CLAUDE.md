# CLAUDE.md — Instructions for Claude Code

Read automatically when Claude Code runs from the repo root. It describes the app as it is, not the original MVP brief.

## What this repo is

One Next.js app in `demo/` with two modules that share a database but not a login:

- **Tracker** (`/my-day`, `/projects`, `/dashboard`, …) — roles `Admin`, `Lead`, `Coordinator`, `HR`, `BusinessDeveloper`, `Developer`. Session cookie `tracker_session`, table `Session`, users in `User`.
- **Engineering** (`/engineering/*`, API under `/api/domain/*`) — roles `Admin`, `CEO`, `Lead`, `TeamLead`, `SME`, `Actionee`. Session cookie `domain_session`, table `DomainSession`, users in `DomainUser`. In code it is still called "domain".

Read `README.md`, then `docs/` and `specs/` in numbered order, before larger changes.

## Hard rules

1. **Never lose data on redeploy.** Migrations are additive by default; a data-changing migration must be safe to re-run. The seed only bootstraps an empty database. Anything destructive is opt-in behind an explicit flag that is never on the deploy path.
2. **Enforce every permission on the server.** The UI hiding a button is never the control. Use the helpers in `lib/server-access.ts` (Tracker) and `lib/domain-auth.ts` / `lib/domain.ts` (Engineering) rather than new ad-hoc checks.
3. **Scope by object, not just by role.** Checking a role is not enough when the request names an object: confirm the object belongs to the project/task the permission was checked on (see `canUseTaskFiles`, `canAccessProject`, `canSeeTask`).
4. **Every new or changed endpoint gets a test** that the wrong role (or the wrong object) gets `403`/`404`, in `demo/__tests__/`.
5. **Route files export only HTTP handlers** (`GET`, `POST`, …) and Next's route config. Helpers go in `lib/` — Next fails the build on any other export from `route.ts` or `middleware.ts`.
6. **Don't add roles** without updating `docs/02-roles-and-permissions.md`, `lib/access.ts` (client) and the server helpers together.
7. **Secrets never go in the repo or the EmailLog.** Session and reset tokens are stored hashed (`lib/session-token.ts`, `hashResetToken`).
8. **Follow the design system** (`docs/design-system.md`): colours, widths and motion come from `demo/lib/design-tokens.ts` — no hex values or one-off sizes in components. Text uses `ink-400` or darker or a `brand-*Text` shade; no text below 12 px; icon-only buttons carry `aria-label` and `tap-target`; labels are tied to inputs; grids set `grid-cols-1`; tables scroll in `overflow-x-auto`. `__tests__/design-tokens.test.ts` enforces most of this.

## How to work

- From `demo/`: `npx tsc --noEmit` and `npm test` must pass before you hand anything back. `npx vitest run __tests__/a11y.test.tsx` is the accessibility check (axe-core).
- Prefer the simpler implementation; this is an internal tool for a few dozen people.
- Keep comments in the existing style: explain *why*, in full sentences.
- Commit messages: imperative and concise. Don't commit or push unless asked.
- Working copy uses CRLF line endings on Windows (`core.autocrlf=true`); keep files that way.

## Running it

- Tests: `cd demo && npm test`
- Local app: see `demo/README.md` (or the `verify` skill in `demo/.claude/skills/`).
- Production: GitHub Actions builds `ghcr.io/varadh8/tracker-app`; Portainer deploys `compose.yml` to the Swarm. See `specs/08-deployment.md`.

## Things not to do

- Don't wipe, reset or re-seed a populated database on deploy or restart.
- Don't reintroduce the deleted `backend/` (FastAPI), `frontend/` (Vite) or `caddy/` scaffolds — the app is `demo/`, and Traefik is the proxy.
- Don't parse uploaded spreadsheets with anything but the pinned SheetJS build (`xlsx` from cdn.sheetjs.com, ≥ 0.20.2); the npm `xlsx` 0.18 has unpatched CVEs.
- Don't log or store raw tokens, passwords or reset links.
