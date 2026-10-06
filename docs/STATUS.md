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

## M3 follow-up — editor visibility and deletion (2026-10-06)

Implemented:
- Source/candidate successful saves close their forms; errors preserve entered content. Cancel is available.
- The problem library no longer auto-selects the first problem or loads its private package. Explicit title / Edit
  draft / View version selection opens the editor. Close editor confirms discarding unsaved changes.
- Admin-only confirmed deletion for sources, candidates and problems through role-checked, atomic RPCs.
- Sources with references are protected. Candidate deletion keeps converted problems. Whole problem deletion
  removes versions/packages/links only without attempts; a linked candidate returns to pending_review.
- Existing interviews, published snapshot immutability, public/private boundaries, layout and CSS are preserved.
- New incremental migration: `20261006000300_m3_editor_deletion.sql`; applying it removes no existing rows.

Verification:
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check:boundaries` and `git diff --check`: PASS.
- `pnpm test`: PASS, 50 tests. New PostgreSQL coverage includes admin-only delete RPCs, forbidden direct
  deletes, linked-source protection, candidate/problem independence, candidate reset/reconversion, complete
  version/package/link cleanup, immutable standalone snapshots and preservation of interviews/debriefs.
  An injected migration failure also verifies FK/RPC changes roll back atomically.
- Headless Firefox exercised actual components in an isolated local fixture with simulated server responses:
  source/candidate add/edit success closes the form, failure preserves inputs, Cancel closes; deletion cancel
  calls no action, failure preserves the row, success removes it. The real Problem page component makes no
  detail fetch on its initial list, explicit selection opens it, dirty Close editor asks for confirmation,
  and deleting the selected problem returns to the list. Screenshots inspected; globals.css remains unchanged.
- No hosted content was deleted. Hosted authenticated deletion is not claimed tested; its database behavior
  was exercised only in disposable local PostgreSQL.
- Commit `78da999` pushed to the existing main integration; its Supabase Preview check completed successfully.
  The new migration is applied. Anonymous calls to all three delete RPCs return 401 / SQLSTATE 42501.
  Public metadata before/after application is unchanged: 9 categories and 3 current published problems/versions.
- Live localhost HTTP checks pass for public catalog/details/Auth pages (200), protected admin/preview/review
  redirects (307), and absence of private packages in public HTML/RSC. The original port-3001 process remains
  running; temporary fixture/WebDriver processes were stopped.

Manual follow-up: refresh the Admin pages, save a source/candidate and confirm the form closes. Open a problem
through Edit draft, then Close editor. Delete only disposable entries without references/interviews to check the
new authenticated end-to-end actions in your own browser; confirmed deletion is permanent.

## M3 follow-up — consistent save-and-close and action alignment (2026-10-06)

- Successful **Save draft** returns to the problem list with confirmation; **Edit draft** reopens the saved
  version for continued editing, preview or publication. Validation alone leaves the editor open.
- Category add/edit now opens explicitly and closes after a successful save, matching Source/Candidate/Draft.
  All save failures retain entered content. New-problem creation closes/resets its creation form before
  opening the new draft. The convention is recorded in AGENTS and the content workflow.
- Draft/review selects share a column; save/validate/publish controls align with their selects at 44px height.
  Candidate review/edit/reject/delete buttons share a wrapping row, equal heights and 12px spacing.
  CSS changes are scoped to Admin action rows; existing User panels/navigation remain intact.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (50 tests), `pnpm build`, `pnpm check:boundaries`,
  and `git diff --check`: PASS.
- Actual components in an isolated Firefox fixture passed save success/failure, reopen, category add/edit,
  new-problem form reset, desktop geometry and 500px no-overflow checks. Screenshots inspected.
  Server responses were simulated; this was not a hosted authenticated mutation test.
- No database schema, dependency, authentication or milestone changes. No hosted data was modified.

## M3 follow-up — reveal opened editors (2026-10-06)

- Source/Candidate/Problem/Category editors and the new-problem form scroll into view when opened.
  A shared hook waits for the rendered element, keeps top spacing and respects reduced-motion preferences.
  Field edits do not trigger scrolling; successful-save closure remains unchanged.
- Problem selection, candidate conversion, version links, dashboard review links and preview-return links
  let the editor own scrolling instead of Next's default navigation scroll.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (50 tests), `pnpm build`, `pnpm check:boundaries` and
  `git diff --check`: PASS.
- Headless Firefox with actual components and long-list fixtures verified Source add/edit, Candidate selection,
  Problem open/reopen, Category create/edit, creation-form toggling, stable scrolling during typing and 500px
  mobile layout. A separate Firefox reduced-motion session verified immediate scrolling. Screenshots inspected.
  Server responses were simulated; no hosted data was changed. No schema/dependency/milestone changes.

## M3 follow-up — collapsible evaluation subsections (2026-10-06)

- All seven Evaluation package subsections (reference answer, rubric, alternatives, misconceptions,
  hints, completion criteria and examples) start expanded and can be toggled independently.
- Light 1px separators remain visible between subsections when expanded, collapsed or mixed.
  Existing section spacing is retained; focused Firefox checks and desktop/mobile screenshots confirmed this.
- Native details/summary controls support pointer and keyboard interaction, including read-only versions.
  Fields stay mounted: collapsing preserves unsaved text, JSON validation state and draft save behavior.
  Browser form validation reopens invalid sections before focusing the field; toggles do not mark a draft dirty.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (50 tests), `pnpm build`, `pnpm check:boundaries` and
  `git diff --check`: PASS.
- Headless Firefox with actual components verified initial expansion, independent toggles, Enter/Space,
  input retention across rerenders, invalid collapsed JSON blocking save and reopening, save/reopen behavior,
  read-only navigation and 500px layout. Desktop/mobile screenshots inspected. The isolated fixture simulated
  server responses; no hosted data was changed. No schema, dependencies or milestone changes.

## M3 follow-up — JSON keyboard indentation (2026-10-06)

- JSON fields support Tab for two spaces and Shift+Tab for outdent, including selected lines without
  replacing selected tokens. Escape followed by Tab/Shift+Tab preserves forward/backward keyboard navigation.
  Product help explains these shortcuts. Other textareas retain their existing behavior.
- Indentation uses the same input/validation path as typing. Invalid JSON still blocks saving and corrected
  JSON clears the error; a collapsed invalid section reopens as before.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (50 tests), `pnpm build`, `pnpm check:boundaries` and
  `git diff --check`: PASS.
- Headless Firefox verified caret/selection retention, single/multiline indentation, line-boundary selections,
  odd-space/tab outdent, Escape navigation, invalid/corrected JSON and mock save/reopen behavior for the actual
  components. Both completion groups and visualization JSON use the shared control. No hosted data was changed.

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
