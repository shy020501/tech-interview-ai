# Milestone status

Current milestone: **M4-B**

Status: **M4-B, difficulty-only classification and the Admin Test follow-up are pushed. The Admin Test commit's Supabase migration check succeeded and read-only hosted checks no longer return missing-origin errors. Authenticated browser verification remains unverified. Production build/dev server are blocked by this execution environment's port-binding restriction.**

Verification date: 2026-10-07 Asia/Seoul (smoke artifact timestamp uses 2026-10-06 UTC).
M4-A implementation/results and unresolved label/holdout review: [M4A_STATUS](history/M4A_STATUS.md).
Prior milestones: [M3_STATUS](history/M3_STATUS.md), [M2_STATUS](history/M2_STATUS.md).
Existing user-edited layout, stylesheet, navigation, category/problem catalog and authoring workflow are retained.

## Admin Test activation — 2026-10-07

- Pushed `9b628b5` to the existing `origin/main`: isolated test workspace, Evaluation source tags,
  legacy read compatibility and `20261007000200_admin_test_workspace.sql`.
- [Supabase Preview check](https://github.com/shy020501/tech-interview-ai/runs/112661559744) completed
  successfully at `2026-10-07T06:24:56Z` (15:24:56 Asia/Seoul) through the existing GitHub integration.
  No schema SQL was manually replayed; no reset, seed or capability rotation was performed.
- Read-only hosted requests for `attempts.origin` and `message_evaluations.origin` now return the
  expected anonymous permission denial (`401` / `42501`), replacing the earlier absent-column errors
  (`400` / `42703`). No attempt/evaluation rows or credentials were printed.
- The same committed source passed lint, typecheck, all 164 tests and the 18 client source-boundary
  checks in the preceding fix. Scanned all 165 tracked/unignored files against configured secret
  values before pushing: no matches. `.env.local` remains ignored. No paid provider calls.
- Reload `/admin/test` to use the workspace. Actual authenticated Start/Send/Reset and Evaluation
  tags still need a browser check; the migration and read-only checks do not establish that flow.

## Follow-up: Admin Test workspace — 2026-10-07

- Added **07 Test** (`/admin/test`): published problem selection, public scenario/assumptions/visualization,
  shared InterviewChat, live/mock feedback/progress, hints and failed-evaluation retry. No separate evaluator.
- Tests have their own saved attempts. The same admin's User Practice session/history is separate and unaffected.
  Existing test sessions resume at their pinned version; Reset uses the current published version.
- Reset is available during evaluation. It atomically abandons the previous test and creates an empty one,
  preserving messages/hints/QA records. Request UUIDs, profile locks and invalidated claims prevent duplicate
  resets and late results from mutating the replacement conversation. In-flight remote calls may still bill;
  canceled observations retain unavailable usage/cost rather than an invented zero.
- **06 Evaluations** shows an **Admin Test** badge, response label and source filter. Origin is derived from
  the persisted attempt in the DB, not from account role or a client-supplied tag. Admins using the regular
  User UI produce **User Practice** records. Previous records are not retroactively guessed to be tests.
- Added incremental `20261007000200_admin_test_workspace.sql`: origin/request metadata, separate active-session
  uniqueness, admin start/reset RPC, immutable evaluation provenance and an admin-test guard around the
  existing evaluator RPC. Preserves RLS, ownership, capability and account rate/quota checks.
- Public problem markup was extracted into a shared component without changing practice layout/classes.
  Admin Test uses two equally sized content/chat columns and the existing design language. Draft preview,
  normal Hint/Finish/Review and other Admin authoring screens retain their existing behavior.
- At initial local implementation: no extra dependencies, paid provider calls, hosted mutation, commit or push. No new environment variable or
  capability rotation is needed. Apply the new migration through the existing GitHub integration before using
  these app changes; do not reset/re-seed or manually replay schema migrations in SQL Editor.

Initial local verification for this follow-up (before the activation recorded above):

| Command / check | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 159 tests; disposable PostgreSQL and mock providers only |
| `pnpm check:boundaries --source-only` | PASS — 18 client import graphs; generated assets not checked |
| `git diff --check` | PASS |
| `pnpm build` (including escalated retry) | BLOCKED — Turbopack CSS worker port binding: Operation not permitted |
| `pnpm dev` | BLOCKED — listen EPERM on 127.0.0.1:3001; no existing process was stopped |
| HTTP `/admin/test`, browser rendering, hosted migration | Not verified / not applied |

Local regression cases cover migration rollback/preservation, admin-only creation, practice/test separation,
origin tagging, resume/reset idempotency, retained QA, hints/progress reset, late provider results, failure/retry,
other-account/revoked-admin denial, account quotas surviving reset and old/new published-version pinning.
Browser checks and activation steps: [M4B_VERIFICATION, Admin Test](M4B_VERIFICATION.md#7-admin-test-follow-up).

### Follow-up fix: Admin pages before migration — 2026-10-07

- Read-only hosted requests (`select=origin&limit=0`, no returned rows) confirmed PostgreSQL `42703`
  for both `attempts.origin` and `message_evaluations.origin`. The Admin Test migration is not applied;
  this is distinct from the already applied M4-B migration. No hosted data/schema was changed.
- Evaluation QA now loads existing practice records when that specific column is absent, with a setup
  notice and disabled source filter. Test shows the same migration notice instead of the generic Admin
  error screen; no practice session is substituted and no test actions/provider calls are offered.
- Normal practice resume/history also work before the migration. After application, the next request
  uses persisted origin and keeps practice/test conversations separate; no process-level schema flag is cached.
- Compatibility reads only accept the exact PostgreSQL missing-origin error. Auth, permission, network,
  other missing columns and schema-cache errors are not masked. A failed legacy query stays an error.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (164 tests), source-only boundary checks (18 import graphs),
  and `git diff --check` passed. Local PostgreSQL regression tests cover before/after schema behavior,
  empty results and non-fallback failures. No paid provider calls.
- `pnpm build` remains blocked by the environment's Turbopack worker port-binding restriction.
  Authenticated browser rendering remains unverified. No commit/push/migration application was performed.

## Push status — 2026-10-07

The user explicitly approved pushing commit `20a7b35` and applying the two migrations after the
initial automatic-approval rejection. The commit was pushed to `origin/main` successfully. It includes
the M4-A engine/benchmarks, M4-B runtime and difficulty-only follow-up.
`origin/main` was checked remotely at `a1c6435`; there were no intervening remote commits.
GitHub's preceding Supabase Preview check succeeded. Schema changes use that existing integration.

Commit `20a7b35`'s **Supabase Preview** check completed successfully at `2026-10-07T02:10:54Z`
(11:10:54 Asia/Seoul). The M4-B and question-type-removal migrations were submitted together through
the existing integration. No schema SQL was manually replayed and no reset/seed was run.

- Re-ran lint, typecheck, all 143 tests and source-boundary checks: PASS. No paid API calls.
- Scanned the 155 tracked/unignored files against locally configured secret values: no matches.
  `.env.local`, evaluator artifacts and local profile overrides remain ignored.
- Production build still fails at Turbopack worker port binding, including an escalated retry.
  This is not recorded as a successful build or browser check.
- Read-only checks against the configured hosted Supabase project: public category and version/difficulty
  reads return HTTP 200; querying the retired `question_type` returns PostgreSQL `42703` (column absent).
  Anonymous reads of both new assessment tables return HTTP 401 / `42501` (permission denied).
  These checks do not replace authenticated ownership/RLS or browser flow verification.
- No direct database administration credential is available. Runtime capability registration is a
  separate trusted SQL operation, not a schema migration. The ignored generated setup SQL matches
  the local secret and does not contain its raw value; it has not been applied by this agent.

## Follow-up: difficulty-only classification — 2026-10-07

- Removed Question Type (Core/Advanced) from the User catalog/filter/cards, shared interview/preview,
  Admin candidate cards/forms, problem list/editor, public/domain contracts and authoring validation.
- Difficulty remains Beginner / Intermediate / Advanced. Existing difficulty values are unchanged;
  the Drone scenario remains Intermediate. Categories, competencies and tags are retained.
- Catalog controls now use three columns (search/category/difficulty); the smaller layout places search
  above the two selects. Existing card emphasis and interview/Admin panel layout remain intact.
- Removed the type-based sort; filtered results retain repository publication order. No content is
  reclassified by its former type. Current seed inputs/generator and docs reflect the new contract.
- Added `20261007000100_remove_question_type.sql`: atomically replaces the relevant validated Admin
  RPCs and removes only `question_type` from versions/candidates. Existing difficulty/content/package,
  identity/version IDs and saved attempts/messages/hints are preserved. Applied migrations are unchanged.
- Disposable PostgreSQL tests verify rollback, preservation, authorization, candidate create/edit/convert,
  draft validation/publication, immutable published snapshots and old/new attempt version pinning.

Current follow-up verification:

| Command / check | Result |
| --- | --- |
| `pnpm seed:generate` | PASS — local SQL generation only; no hosted seed execution |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 143 tests; no paid APIs or hosted DB calls |
| `pnpm check:boundaries --source-only` | PASS — 17 client import graphs |
| `git diff --check` | PASS |
| `pnpm build` | BLOCKED — Turbopack CSS worker port binding is not permitted in this execution environment |
| `pnpm build --webpack` | FAILED — Next.js could not parse its TypeScript `--showConfig` subprocess output; standalone `tsc --showConfig` succeeds; no build configuration was changed |
| Browser rendering / new generated assets / hosted migration | Not verified / not applied |

The user reported a successful full boundary check before this follow-up (17 client graphs, 19 browser
chunks, 3 static public HTML files). That result does not validate assets generated from these new changes.
No commit/push/hosted migration was performed during the initial classification implementation.
The later approved push and hosted observations are recorded above; do not reset or re-seed the DB.
After applying it, check the difficulty filter, candidate create/edit, Draft save/publish, User detail and
Admin preview at `http://localhost:3001`, then rerun build and full generated-asset boundary checks.

## Completed in code

- Attempt-scoped authenticated Server Actions share the M4-A compact input/engine/validators/reducer.
- Explicit live/mock mode; configured medium primary / xhigh escalation from the user's registry selection.
  Missing configuration fails closed. No hidden model or mock fallback. Production mock is forbidden.
- Durable user-message claim before model calls, UUID idempotency, one active evaluation per attempt,
  base revision/sequence checks, lease expiry/recovery (including another abandoned attempt's reservations),
  bounded retry of the saved message, and atomic final state/feedback persistence.
- Independent strong evaluation on configured escalation conditions. Primary state is not applied first;
  invalid/unreliable/failed final output preserves reasoning and progress.
- Intent routing with fixed server feedback; public-only clarification/meta handling; no generic chatbot endpoint.
- DB-backed success/request/escalation budgets and minute limits, abuse strikes/cooldown, configurable MVP defaults.
- Server progress and core-complete notice, without automatic Finish. Input remains editable while evaluating.
- Adaptive hint selection with version/state/prerequisite/used-hint checks; one released hint, no progress credit.
  Bounded already-released hint provenance is labelled separately in evaluation input.
- Completed-owner reference debrief plus deterministic covered/unresolved summaries; no generative debrief.
- Per-call assessment logs: provider/profile/model, policy/schema/profile version, validation/evidence result,
  usage/cached tokens, latency, cost availability, escalation reasons and sanitized errors.
- DB-backed `/admin/evals`, filters and human review/notes. Review editor opens explicitly and closes after saving.
  Human annotations never recalculate attempts. Admin dashboard counts actual pending evaluations.
- Incremental atomic migration, gated evaluator RPC, retained RLS and revoked legacy mock-turn/hint execution.
  Both user session and a limited server capability are required; no Supabase service-role key is introduced.
- Setup helper, explicit four-case live smoke helper, env template, architecture/evaluator/setup/manual-check docs.

## Initial implementation verification (before the approved push)

| Command / check | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 135 tests; no paid calls or hosted DB access |
| `pnpm eval:dry --split all --all-cases` | PASS — 83 fixtures, 80 valid fixture outputs + 3 pre-guard rejections; this is not model accuracy |
| `pnpm check:boundaries --source-only` | PASS — 17 client import graphs; generated bundle/dynamic HTTP payloads NOT checked |
| `pnpm eval:setup live` | PASS — local explicit live mode/capability and hash-only SQL generated; existing provider/Supabase entries preserved, no DB/API call |
| `pnpm eval:smoke --plan` | PASS — four synthetic messages, at most eight requests |
| `pnpm eval:smoke --live` | PASS — 4 actual primary requests, all schema/semantic/evidence valid; no escalation needed in these four cases |
| `git diff --check` | PASS |
| `pnpm build` (including escalated retry) | FAILED — Turbopack CSS worker cannot bind a port: Operation not permitted |
| `pnpm dev` on 127.0.0.1:3001 | FAILED — listen EPERM; no existing process was killed |
| HTTP `/problems` at 127.0.0.1:3001 | Not verified — connection unavailable in this execution environment |
| Browser rendering / authenticated browser E2E / DevTools responses | Not verified |
| Hosted Supabase migration / new capability setup / live cookie-session flow | Not applied or verified; no trusted migration access was available |

The M4-B PostgreSQL tests use the **entire** tracked migration chain and mock transport, exercising normal
reasoning, all nonreasoning intents, state downgrades, strong success/failure, invalid evidence, structured retry,
request replay, concurrent retries, rate/quota/strikes, stale recovery, adaptive hints, ownership/RLS and Admin QA.
The historical M3 SQL test remains tested against the M3 stage because M4-B deliberately revokes old mock RPCs.
These are runtime/database integration tests, **not browser or hosted Supabase E2E tests**.

Real-provider smoke artifact (gitignored):
`artifacts/evals/2026-10-06T14-54-46-751Z-m4b-smoke/summary.json`.

- Four synthetic Drone inputs: reasoning, off-topic, prompt injection, clarification. All intents matched.
- Only reasoning changed progress (0 → 12.5); other inputs preserved 12.5. Synthetic Finish/debrief succeeded.
- Actual calls: 4 medium, 0 xhigh, no structured retry. Strong branching was tested with mock transport, not a
  new paid escalation example. M4-A's previous xhigh benchmark remains historical evidence, not this smoke.
- Provider-reported tokens: input 12,981 / output 650 / cached input 8,937.
- Recorded call latency: 2.32–4.94 seconds. Registry-based estimated total **USD 0.00081877**, not an invoice.
- Disposable PostgreSQL only. No hosted user/content data was read, reset or modified by the smoke.
- This small smoke verifies wiring; it does not establish deployment-wide accuracy or abuse resistance.

## Activation still required

The M4-B and difficulty-only migrations have been pushed and the Supabase check passed. Do not replay
those schema files, reset or re-seed the existing DB.

1. Local `pnpm eval:setup live` is already complete. It preserved existing Supabase/provider entries and generated the capability plus hash-only SQL. On a new environment, run it there before registering that environment’s hash.
2. If not already registered, apply generated `artifacts/evals/setup/runtime-capability.sql` through trusted SQL, then
   restart dev. The hash-only configuration is separate from schema migration history. Real keys are never pasted.
3. Run build/bundle checks from the user's normal terminal, then the User/Admin/Network checks in
   [M4B_VERIFICATION](M4B_VERIFICATION.md). Ignored `.env.local` now has explicit live mode and a server capability;
   hosted registration was not performed or verified by this agent. Neither secret values nor provider keys were printed.

## Known limitations / not implemented

- Hosted migration check and limited read-only schema checks passed as recorded above. Authenticated browser
  Auth/UI rendering, dynamic interview payload and full production build verification remain incomplete.
- Benchmarks still need human ground-truth review and held-out quality evaluation. M4-B adds no automatic model selection.
- Clarification repeats public assumptions conservatively; no newly generated condition or fine-grained assumption matching.
- No exactly-once remote billing after process crashes; reserved stale calls can retain unknown usage/cost.
- Admin QA shows latest 100 evaluations; notes support future export, with no automatic benchmark export/reprocessing.
- Token usage is logged, but a daily token quota is not implemented. Request/success/escalation limits are active.
- No automatic source discovery/crawler, LLM authoring, fine-tuning, self-hosted evaluator, RAG/queues, billing,
  Korean localization or production deployment changes.

M4-B implementation stops here. Next work requires user direction: activate/verify hosted M4-B, review live QA
and benchmark annotations; automatic source discovery is only a later milestone candidate.
