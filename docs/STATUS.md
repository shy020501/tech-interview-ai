# Milestone status

Current milestone: **M3**

Status: **Implementation complete; deployment verification in progress**

M2 연결과 모든 요구 검증은 사용자가 M3 요청에서 완료를 확인했다. 상세 이력은 [M2_STATUS](history/M2_STATUS.md)에 보존한다.

## Completed

- DB-backed manual sources: create/edit/reject, source type, usage/provenance notes and category suggestions.
- DB-backed question candidates, optional source, editable suggestions, reject/return to review and idempotent conversion.
- Problem public content, classification, structured visualization and source links editor.
- Private evaluation package editor: stable rubric IDs, add/edit/delete/reorder, prerequisites, alternatives,
  misconceptions, hint ladder, completion criteria and labelled evaluation examples.
- Draft saves accept incomplete content; server/DB validation rejects invalid references/types/graphs.
- Admin-only preview reuses the existing User workspace. No draft content is exposed through public routes.
- Server-authorized, transaction-safe validation/publication with explicit human review in the UI.
- Published snapshot immutability in database triggers; new version copies public/private content and
  classification/source links. Revision guards prevent stale edits. Version history and archive are available.
- Version-specific category memberships, stable existing attempt references and current-version new attempts.
- Category create/edit/reparent/order/delete, arbitrary depth, cycle prevention and in-use delete protection.
- Requested hints released one at a time by level/list order, persisted with retry idempotence.
- Completed-owner debrief returns reference answer, key ideas and alternatives for the pinned version only.
- Source/candidate mocks removed from runtime; existing M2 seed/content/account data are preserved.
- English-first and provider-independent contracts maintained. Existing globals.css and navigation unchanged.
- Workflow/setup/architecture documentation and a hosted rollback SQL verification guide.

## Verification

Executed on 2026-10-06:

| Check | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 43 tests, including in-memory PostgreSQL migration/RLS/RPC tests |
| `pnpm build` | PASS — all routes, including admin preview |
| `pnpm check:boundaries` | PASS — client import/browser assets/public static HTML inspection |
| `git diff --check` | PASS |

Database tests apply all migrations in disposable PGlite PostgreSQL, preserve an M2 attempt and an existing
future draft, and exercise admin/user/anon roles. Assertions cover authorization, candidate conversion,
invalid/valid publication, frozen published content, new versions, pinned attempts/categories, one-hint release,
retry behavior, completion/ownership debrief rules, category cycles/deletion and archive/history.
The entire `supabase/tests/content_workflow.sql` also passes locally and rolls back its synthetic records.
No hosted DB reset or destructive cleanup was performed. PGlite is a dev dependency only.

These PostgreSQL tests do not represent a hosted authenticated browser session. M3 migration application,
hosted read-only checks and browser observations are being verified and will be recorded separately.

## Still mock / not implemented

- Interview feedback and progress remain explicitly scripted; no personal correctness/rubric judgment.
- `/admin/evals` remains a labelled evaluator QA fixture with local-only review controls.
- No automatic source discovery, external source fetch, LLM authoring or live answer evaluation.
- No adaptive reasoning progress, adaptive hint selection, evaluator routing or benchmark execution.
- No Korean localization, billing, queue infrastructure or production website deployment changes.
- No custom in-app navigation blocker; save before leaving an editor. Browser close/reload warns when dirty.

## Next milestone

**M4 — Provider-agnostic live evaluator and evaluator benchmark.**
Connect structured evaluator results to the pinned package and server-owned reasoning state; replace scripted
feedback/progress and deterministic hint ordering only when explicitly authorized. Stop after M3.
