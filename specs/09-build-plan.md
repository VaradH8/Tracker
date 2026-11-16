# 09 — Build plan and roadmap

The original phase-by-phase MVP plan is complete and the product has grown past it. This page records where things stand and what comes next. The findings come from the product and security review of 2026-11-16.

## Where it stands

| Area | Status |
| --- | --- |
| Tracker: projects, tasks, approvals, dependencies, forks, time, attachments | Live |
| Leaves, calendar, notifications (in-app + email) | Live |
| Resources, engagement, project forecasts | Live |
| Performance reviews (monthly/yearly, Word export) | Live |
| Clients and sales pipeline | Live |
| Engineering module (allocations, submissions, approvals, forecast, KPIs) | Live |
| Excel import (workbook and per-project task import) | Live |

## Done in the 2026-11 hardening pass

- [x] Attachment delete checks the file belongs to the task (was: any assignee could delete any attachment).
- [x] Task files need task visibility or the project roster, not just project reach; time-log and remark deletes scoped to the editor's projects.
- [x] Login throttle counts only failures; client IP from the right-most `X-Forwarded-For` hop.
- [x] Session tokens stored hashed (migration hashes existing ones in place — nobody is signed out); every password change ends other sessions.
- [x] SheetJS moved from npm 0.18.5 to the patched 0.20.3 build.
- [x] Optional `SETUP_TOKEN` for first-admin forms; `scripts/check-first-admin.ts` to check production.
- [x] Reset links kept out of the email log once SMTP is on; JSON backup covers every table and leaves hashes out by default.
- [x] Content-Security-Policy on pages; Origin check on API writes.
- [x] Accessibility: 12 px minimum text, larger pointer targets on icon buttons, labelled auth forms, axe check in CI.
- [x] Skeleton loading states, per-section error boundaries, offline banner, undo for task and project deletes.
- [x] Docs and specs rewritten to match the real app; unused scaffolds removed.
- [x] Colour contrast: text tokens all ≥ 4.5:1 (ink-400 darkened, brand `*Text` shades for words), enforced by a test.
- [x] Every form label tied to its field; toggle groups named; `aria-pressed` on toggles.
- [x] Design system: `lib/design-tokens.ts` feeds Tailwind, charts and logo; no hex in components; motion tokens and reduced-motion support; `docs/design-system.md`.
- [x] Phones: no page scrolls sideways at 390 px; tables scroll inside their card; button rows wrap.
- [x] First-run welcome card per role, in both modules.

## Next

- [ ] Back up `tracker_uploads`, set up the encrypted off-host copy, run a restore drill.
- [ ] Require TLS for SMTP (`requireTLS`) on port 587.
- [ ] CI supply chain: Dependabot, `npm audit`, Trivy image scan, actions pinned by SHA, deploy SHA tags only, pin the rclone and backup images.
- [ ] Make the GHCR image private; move secrets to Docker secrets.
- [ ] Allowlist attachment file types.
- [ ] Session idle timeout (sessions are a fixed 30 days today).
- [ ] Undo for Engineering task/project deletes (Tracker only so far).

## Open questions

- Should Tracker and Engineering share one login and one user table?
- Is first-name sign-in deliberate? It makes accounts easier to guess.
- SSO with the company identity provider?
- Will the tool have non-English or mobile-first users? If not, localisation stays out of scope.
- Who owns dependency and security patching?
