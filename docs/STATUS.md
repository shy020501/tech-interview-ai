# Milestone status

Current milestone: **M4-B**

Status: **M4-B implementation and disposable-PostgreSQL/mock runtime tests pass. A four-message real-provider smoke passed. Hosted Supabase migration/capability activation and browser verification are still pending. Production build/dev server are blocked by this execution environment's port-binding restriction.**

Verification date: 2026-10-07 Asia/Seoul (smoke artifact timestamp uses 2026-10-06 UTC).
M4-A implementation/results and unresolved label/holdout review: [M4A_STATUS](history/M4A_STATUS.md).
Prior milestones: [M3_STATUS](history/M3_STATUS.md), [M2_STATUS](history/M2_STATUS.md).
Existing user-edited layout, stylesheet, navigation, category/problem catalog and authoring workflow are retained.

## Push status — 2026-10-07

The user asked whether the pending work can be applied and pushed after the classification change.
The pending submission includes the M4-A engine/benchmarks, M4-B runtime and difficulty-only follow-up.
`origin/main` was checked remotely at `a1c6435`; there were no intervening remote commits.
GitHub's preceding Supabase Preview check succeeded. Schema changes use that existing integration.

- Re-ran lint, typecheck, all 143 tests and source-boundary checks: PASS. No paid API calls.
- Scanned the 155 tracked/unignored files against locally configured secret values: no matches.
  `.env.local`, evaluator artifacts and local profile overrides remain ignored.
- Production build still fails at Turbopack worker port binding, including an escalated retry.
  This is not recorded as a successful build or browser check.
- No direct database administration credential is available. Hosted migration outcomes must be checked
  after push; runtime capability registration is a separate trusted SQL operation, not a schema migration.
- A local commit was prepared. Automatic approval review rejected `git push origin main` before execution:
  the 92-file submission and two hosted migrations require explicit approval of that scope, and a successful
  build has not been verified. No remote push or hosted database change occurred. Awaiting explicit approval;
  the rejection will not be bypassed through a different transport or branch.

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
No commit/push/hosted migration was performed. Candidate/Draft saves and publication with the new app
require the new migration through the existing GitHub → Supabase path; do not reset or re-seed the DB.
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

## Executed verification

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

1. Review/apply `20261006000400_m4b_live_evaluation.sql` using the existing GitHub → Supabase migration path.
   No migration commit/push/hosted apply was performed in this turn. Do not reset or re-seed the existing DB.
2. Local `pnpm eval:setup live` is already complete. It preserved existing Supabase/provider entries and generated the capability plus hash-only SQL. On a new environment, run it there before registering that environment’s hash.
3. After migration, apply generated `artifacts/evals/setup/runtime-capability.sql` through trusted SQL, then
   restart dev. The hash-only configuration is separate from schema migration history. Real keys are never pasted.
4. Run build/bundle checks from the user's normal terminal, then the User/Admin/Network checks in
   [M4B_VERIFICATION](M4B_VERIFICATION.md). Ignored `.env.local` now has explicit live mode and a server capability; hosted registration remains pending. Neither secret values nor provider keys were printed.

## Known limitations / not implemented

- No hosted migration, browser Auth/UI rendering, dynamic payload or full production build verification in this environment.
- Benchmarks still need human ground-truth review and held-out quality evaluation. M4-B adds no automatic model selection.
- Clarification repeats public assumptions conservatively; no newly generated condition or fine-grained assumption matching.
- No exactly-once remote billing after process crashes; reserved stale calls can retain unknown usage/cost.
- Admin QA shows latest 100 evaluations; notes support future export, with no automatic benchmark export/reprocessing.
- Token usage is logged, but a daily token quota is not implemented. Request/success/escalation limits are active.
- No automatic source discovery/crawler, LLM authoring, fine-tuning, self-hosted evaluator, RAG/queues, billing,
  Korean localization or production deployment changes.

M4-B implementation stops here. Next work requires user direction: activate/verify hosted M4-B, review live QA
and benchmark annotations; automatic source discovery is only a later milestone candidate.
