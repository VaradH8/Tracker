# 10 — Acceptance criteria

The definition of done for any change. A pull request is ready when every box that applies is ticked.

## Every change

- [ ] `cd demo && npx tsc --noEmit` passes.
- [ ] `cd demo && npm test` passes (unit, route-permission and accessibility tests).
- [ ] `npm run build` succeeds (CI runs it before publishing an image).
- [ ] No data is deleted, reset or overwritten on deploy or restart.
- [ ] Docs in `docs/` or `specs/` updated if roles, screens, routes, tables or env vars changed.

## API routes

- [ ] The route checks the session (`requireUser` / `requireDomainUser`) unless it's one of the documented public endpoints.
- [ ] The role check uses the shared helpers, and object-level access is checked (the object belongs to the project or task the permission was checked on).
- [ ] A test asserts the wrong role gets `403`, and a mismatched object gets `403` or `404`.
- [ ] The route file exports only HTTP handlers.
- [ ] Secrets (passwords, tokens, reset links) are never returned, logged or stored in plain text.
- [ ] Uploads have a size cap and a server-chosen file name.

## Database

- [ ] Schema change ships as a migration; additive by default.
- [ ] Data-changing SQL is safe to run twice.
- [ ] A new table needs no backup change (`lib/backup-tables.ts` reads the schema) — check the backup test still passes.

## UI

- [ ] Uses the tokens in `lib/design-tokens.ts` (via Tailwind); no hex values or one-off sizes — `__tests__/design-tokens.test.ts` passes.
- [ ] Text uses `ink-400` or darker, or a `brand-*Text` shade; white text only on `brand-blue` or a `*Text` fill.
- [ ] Works at 390 px wide: grids set `grid-cols-1`, tables sit in `overflow-x-auto`, button rows wrap.
- [ ] No text below 12 px (`text-xs`).
- [ ] Icon-only buttons have `aria-label` and `tap-target`.
- [ ] Form fields have labels tied to their inputs (`htmlFor` / `id`).
- [ ] Loading shows a skeleton; empty shows `EmptyState`; errors stay inside a `SectionErrorBoundary`.
- [ ] Destructive actions confirm first, and offer undo where the data model allows.
- [ ] New shared components are added to `__tests__/a11y.test.tsx`.

## Security baseline (must stay true)

- [ ] Session and reset tokens stored only as SHA-256.
- [ ] Login lockout counts failures only; client IP from the trusted proxy hop.
- [ ] Content-Security-Policy on pages; Origin check on API writes.
- [ ] `xlsx` is the SheetJS CDN build ≥ 0.20.2.
- [ ] `SETUP_TOKEN` honoured by both first-admin endpoints.
