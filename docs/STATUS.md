# Milestone status

Current milestone: **M3**

Status: **Implemented and applied to the connected Supabase project. Authenticated M3 browser smoke checks remain.**

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
| `pnpm test` | PASS — 44 tests, including in-memory PostgreSQL migration/RLS/RPC tests |
| `pnpm build` | PASS — all routes, including admin preview |
| `pnpm check:boundaries` | PASS — client import/browser assets/public static HTML inspection |
| `git diff --check` | PASS |

Database tests apply all migrations in disposable PGlite PostgreSQL, preserve an M2 attempt and an existing
future draft, and exercise admin/user/anon roles. Assertions cover authorization, candidate conversion,
invalid/valid publication, frozen published content, new versions, pinned attempts/categories, one-hint release,
retry behavior, completion/ownership debrief rules, category cycles/deletion and archive/history.
An intentional failure at the end of the migration proves all changes roll back without an outer transaction.
The entire `supabase/tests/content_workflow.sql` also passes locally and rolls back its synthetic records.
No hosted DB reset or destructive cleanup was performed. PGlite is a dev dependency only.

### Connected Supabase

- M3 implementation committed/pushed to the existing `main` integration (`f64a10b`, followed by `1a795b0`).
- The first application stopped at its first LOCK statement because this runner does not provide a file-level
  transaction. No data changed in that failed run. Before successful application, the unapplied migration was
  corrected to one atomic DO statement and verified without an outer transaction; Supabase check then passed.
- `20261006000200_m3_content_workflow.sql` is applied. Read-only Data API checks confirm the new version columns
  and memberships, 9 existing categories with unchanged hierarchy, and the same 3 published current versions.
- Anonymous SELECT on sources/candidates/source links/private packages/profiles/attempts/messages/hints is denied.
- Anonymous execution of source creation, publication, hint and debrief RPCs is denied.
- No elevated application credential, test Auth account, hosted disposable content, reset or production website
  deployment configuration was introduced. Existing M2 environment/account/Auth settings remain unchanged.

### Browser and HTTP

- Actual headless Firefox on `127.0.0.1:3001`: category/type filters, empty state and reset pass.
- Interview Sign in gate and disabled anonymous composer pass; at 1440px the existing problem/chat panels are
  both 567px wide. The 500px viewport has no horizontal overflow. Screenshots were visually inspected.
- `/problems`, all 3 seeded published detail routes, `/login` and `/signup`: HTTP 200.
- All 6 admin routes, admin draft preview and `/review` redirect anonymous users to login (HTTP 307).
- Public catalog/detail HTML with embedded RSC contains none of the private package fields/reference answers.
- Actual Admin problem/source/candidate/category components were rendered as isolated static local fixtures
  with the production CSS. Desktop/mobile overflow checks pass; editor/source screenshots were inspected.
  These fixtures do not authenticate, persist or exercise server actions and are not a live Admin workflow test.
- `src/app/globals.css` is unchanged (SHA-256 `72dddeff378bac943b5bbbbbc3b8677ff04008de09a7510cfb3a6207f8dc753e`).
  The existing development server on port 3001 was preserved.

### Remaining manual M3 checks

No admin/user password or authenticated browser session was provided to the agent. Role/ownership tests passed
in local PostgreSQL; **hosted authenticated M3 authoring/hint/review actions have not been exercised by the agent**.
M2's user-confirmed completion does not substitute for these new M3 checks.

1. At `http://localhost:3001/admin`, create a clearly named M3 test source/candidate, convert once, edit a draft
   and its evaluation package, preview, validate and publish. Repeat conversion must return the same problem.
2. As a normal user, start the new problem, request two distinct hints, reload, finish and view its reference debrief.
3. Create/publish V2 while a V1 attempt exists; confirm old attempts retain V1 and fresh attempts use V2.
4. Confirm incomplete/other-user review denial and inspect authenticated problem/hint/review Network responses.
5. Optionally run the complete `supabase/tests/content_workflow.sql` in the trusted SQL editor; it creates only
   synthetic records inside a transaction and rolls back. It was run locally, **not on hosted Supabase**.

Detailed steps: [CONTENT_WORKFLOW.md](CONTENT_WORKFLOW.md). Use archive for test problems with attempts;
do not reset or delete existing data. Current M3 implementation is complete; the above verification is not claimed complete.

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
