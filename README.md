# Inventive Task Manager (Tracker + Engineering)

Internal work tracker for Inventive Business Solutions. It replaced the shared `Ongoing_Projects.xlsx` that 7 teams used to track projects, and grew a second module for the engineering delivery team.

- **Tracker** — projects, tasks, time logs, leaves, performance reviews, resourcing and the sales pipeline. Six roles.
- **Engineering** — tag deliveries, allocations, approvals, forecast and KPIs. Its own login and its own six roles.

Both modules are one Next.js app in [`demo/`](./demo), on PostgreSQL, deployed as a Docker Swarm stack behind Traefik.

## Repository layout

| Path | What it is |
| --- | --- |
| [`demo/`](./demo) | The application: Next.js 15 (App Router) + Prisma + Postgres. Pages in `app/`, API routes in `app/api/`, shared logic in `lib/`, tests in `__tests__/`. |
| [`compose.yml`](./compose.yml) | Production stack: Postgres, the app image from GHCR, nightly `pg_dump`, optional off-host copy. |
| [`.github/workflows/build-app.yml`](./.github/workflows/build-app.yml) | CI: typecheck, tests, accessibility check, production build, then push the image to GHCR. |
| [`docs/`](./docs) | What the product does: overview, roles, workflows, screens. |
| [`specs/`](./specs) | How it is built: data model, API, stack, deployment, roadmap, definition of done. |
| [`tools/xlsx-build/`](./tools/xlsx-build) | Builds the Excel import template. |
| [`historical-import/`](./historical-import) | Drop zone and notes for one-off historical imports. |
| [`assets/`](./assets) | The original spreadsheet, the visual reference (`demo.html`) and the quick guide. |

## Reading order

0. **[docs/architecture.md](./docs/architecture.md) — start here: how the app is built, request flow, security layers, and how to make common changes**
1. [docs/01-overview.md](./docs/01-overview.md) — what the product is and why
2. [docs/02-roles-and-permissions.md](./docs/02-roles-and-permissions.md) — who can do what, in both modules
3. [docs/03-workflows.md](./docs/03-workflows.md) — the everyday journeys
4. [docs/04-screens.md](./docs/04-screens.md) — every screen and who sees it, plus [docs/design-system.md](./docs/design-system.md) — colours, type, layout, motion
5. [specs/05-data-model.md](./specs/05-data-model.md) — tables and relations
6. [specs/06-api-spec.md](./specs/06-api-spec.md) — every API route and its guard
7. [specs/07-tech-stack.md](./specs/07-tech-stack.md) — frameworks and versions
8. [specs/08-deployment.md](./specs/08-deployment.md) — how it runs in production
9. [specs/09-build-plan.md](./specs/09-build-plan.md) — what's done and what's next
10. [specs/10-acceptance-criteria.md](./specs/10-acceptance-criteria.md) — definition of done for any change

## Quick start (local)

```sh
cd demo
npm ci
npx prisma generate
npm test            # unit, route-permission and accessibility tests
npm run dev         # needs DATABASE_URL pointing at a Postgres
```

[`demo/README.md`](./demo/README.md) has the local database setup; [`DEPLOY.md`](./DEPLOY.md) and [specs/08](./specs/08-deployment.md) cover production.
