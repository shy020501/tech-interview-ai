# Milestone status

Current milestone: **M4-A**

Status: **M4-A policy v2 passed the user-authorized full calibration run: 112 paid requests, all outputs valid; rubric agreement with proposed labels was 92/96 for medium and 94/96 for xhigh. Human label review and the reserved holdout evaluation are pending. The revised dataset is a new baseline, not a directly comparable improvement over the old 47-case run. Offline verification passed 108 tests; production build remains blocked by this execution environment.**

Existing M3 UI, Supabase schema/auth/RLS, authoring workflow and interview behavior are preserved.
Prior M3 implementation and verification history: [M3_STATUS](M3_STATUS.md).
M2 user-confirmed verification is preserved in [M2_STATUS](M2_STATUS.md).

## Completed in code

- Provider-agnostic evaluator contract and configurable model registry (roles, capabilities, env references, pricing).
- User-selected GPT-6 Luna medium/default and xhigh/difficult profiles, pure explicit mode selection,
  reasoning-effort capability validation and API parameter forwarding; generic provider example remains disabled.
- Native-fetch OpenAI-compatible adapter, bounded requests/responses, capability-specific structured output and normalized usage/errors.
- Safe HTTP failure diagnostics in request observations, summary and CLI (allowlisted identifiers only).
- Compact evaluation package/input builder, stable policy/problem prefix and bounded recent user context.
- Structured intent/feedback/escalation categories, no free answer/progress/confidence output or tool access.
- Schema, semantic and exact-evidence validation; immutable runtime validation boundary before state updates.
- Sequence/revision-aware deterministic reducer, downgrades/corrections and evidence/assessment provenance.
- Weighted server-side progress, M3-compatible completion evaluation and pure hint target selection core.
- Configurable pre-guards, quota/strike simulation and escalation recommendation without live call chaining.
- Static/global and M3-example benchmark loaders; verified-admin read-only Supabase loader with no elevated key.
- Separate `eval:dry` and explicit `eval:live`, profile selection, representative 10-case smoke subset, limits, concurrency and optional one retry.
- Intent/rubric/false-confirmation/misconception/escalation/reliability/evidence metrics, latency percentiles and usage/cost coverage.
- Ignored JSON/Markdown artifacts with hashes and label projections, excluding prompts, user text, evidence quotes, raw output and secrets.
- Grading policy v2: explicit status/intent boundaries, preserved misconception detection conditions and aligned structural validation.
- `reasoning-v2`: 59 calibration / 24 reserved holdout cases, full reasoning-node labels, rationales and AI-draft review metadata.
- Offline human-review export (19 calibration boundary cases), legacy 47-case selection, per-split/per-status metrics and label coverage.
- Node mock-provider/transport tests; existing M3 PostgreSQL tests retained. No added dependencies.
- EVALUATOR/ARCHITECTURE/PRODUCT_SPEC/README/env documentation and M4-A scope rules.

## Initial M4-A verification — 2026-10-06

| Executed command/check | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 87 tests including existing PostgreSQL lifecycle/RLS tests and 37 evaluator/benchmark tests |
| `pnpm eval:dry --all-cases` | PASS — 47 cases: 44 validated fixture outputs and 3 pre-guard rejections, zero provider requests for rejected cases |
| `pnpm eval:dry --limit 10` | PASS — representative offline smoke subset |
| `pnpm eval:live --profile eval-cheap-a --registry config/evaluator-profiles.example.json --limit 10` | EXPECTED REJECTION — example profile disabled; no API call |
| CLI help/plan/missing-config tests | PASS — no network calls |
| `pnpm check:boundaries --source-only` | PASS — 16 client import graphs; generated build assets NOT checked |
| `git diff --check` | PASS |
| `pnpm build` | BLOCKED by environment — Turbopack worker port binding: Operation not permitted |
| `pnpm build` with sandbox escalation | Same port-binding failure; not a successful build |
| `pnpm build --webpack` | Alternative check also failed: child TypeScript `--showConfig` produced no usable output |

The build limitations were not bypassed by changing project tooling or UI. Source/type/unit checks passed;
**a successful production build and generated-bundle boundary check still require the user's terminal**.
The existing Node ESM type-inference warning is informational. No actual provider key/model configuration
was present, no live API benchmark was attempted, and no model accuracy/latency/cost claim is made.
Fixture playback scores are harness checks only. Current generated artifacts are local and gitignored.

No database migration/reset/data write, hosted Auth test account or LLM SDK was introduced. The Supabase
benchmark loader was tested with injected admin/user clients, not a real hosted admin login. Unit tests remain
independent of hosted Supabase. `src/app/`, `src/components/`, `src/types/`, `supabase/` and pnpm-lock.yaml were
not changed. This turn did not visually inspect browser rendering or claim new live UI verification.

## Manual actions

1. Run `pnpm build`, then `pnpm check:boundaries` in the normal SSH terminal where local worker sockets/processes are permitted.
2. The requested profiles are configured in `config/evaluator-profiles.json`, and the user supplied provider A
   variables in ignored `.env.local`. Both profiles share that key; existing Supabase values were not edited.
3. Review `artifacts/evals/review/calibration-boundary.md` (regenerate with `pnpm eval:review`) using
   [benchmarks/README.md](../../benchmarks/README.md). It contains 19 priority cases, proposed labels and reasons.
   The implementation/policy changes below are verified offline and the complete calibration set was run
   against both profiles; all proposed labels still need human review. Review the disagreements recorded in
   the latest follow-up before further tuning. A 10-case smoke is optional; no additional smoke is required
   after this full run.
   Default remains medium; complex mode selects the user-approved xhigh profile. Holdout requires explicit
   `--split holdout`; do not tune against its outcomes and continue calling it reserved evaluation.
4. Optionally run `pnpm eval:dry --dataset supabase --version YOUR_VERSION_ID --all-cases` with your admin login
   to check the actual M3 example loader, then choose that dataset for an explicit paid benchmark.

## Not integrated / not implemented

- Live interview evaluation, model-based feedback, progress UI or adaptive hint delivery.
- Live escalation chaining, durable assessment/state writes and production rate/quota enforcement.
- Assessment-run database tables or a live Admin evaluator QA workflow; `/admin/evals` remains the labelled demo.
- Benchmark-based model selection or acceptance thresholds; expert-reviewed broader datasets and repeated quality verification.
- Automatic source discovery, authoring LLM, crawlers/jobs, embeddings/RAG, routing, deployment and localization.

Next milestone: **M4-B — Live interview evaluator integration**, only after explicit user instruction.
M4-A stops here; the current user's interview path remains M3.

## Follow-up — Luna medium/default and max/difficult — 2026-10-06

User explicitly requested medium as default and max for difficult evaluations. Implemented:

- `config/evaluator-profiles.json`: enabled, secret-free Luna profiles and default/difficult ID mapping.
  Separate configurable reasoning/output ceilings (16,000 / 32,000) and timeouts (60 / 120 seconds).
- `selectEvaluatorProfile(registry)` returns medium; `complex` / `strong_only` selects max using trusted
  caller metadata. No difficulty inference from user text and no automatic second-model request.
- Optional `reasoningEffort` and per-profile supported values; unsupported values fail before transport.
  Chat Completions receives `reasoning_effort`; configured Luna profiles omit temperature. Other providers
  can omit reasoning capabilities and retain their existing request shape.
- CLI accepts explicit `--evaluation-mode` or `--profile`, prints model/effort in the plan, and stores effort
  in benchmark summary metadata. Default registry is the committed configuration; local overrides require
  `--registry`. The offline dry mode still exclusively uses fixture playback.
- EVALUATOR, README, ARCHITECTURE and env-template instructions updated. No UI, DB, dependency or M4-B change.

Executed verification for this follow-up:

| Command/check | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `node --test --test-isolation=none tests/evaluator-selection.test.mjs tests/evaluator-provider.test.mjs tests/evaluator-benchmark.test.mjs` | PASS — 26 focused tests |
| `pnpm test` | PASS — 94 tests, including 7 new effort/selection tests |
| `pnpm eval:dry --all-cases` | PASS — 47 offline cases |
| `pnpm eval:live --evaluation-mode default --limit 10 --plan` | PASS — medium, up to 10 requests planned, 0 made |
| `pnpm eval:live --evaluation-mode complex --limit 10 --plan` | PASS — max, up to 10 requests planned, 0 made |
| `pnpm eval:live --profile eval-luna-medium --profile eval-luna-max --limit 10 --plan` | PASS — up to 20 requests planned, 0 made |
| `pnpm check:boundaries --source-only` | PASS — 16 client import graphs; build assets NOT checked |
| `pnpm build` | FAILED — same Turbopack worker port-binding restriction (Operation not permitted); no successful production build claimed |

At that follow-up, the two provider A environment values were checked only for presence and were not configured.
No secrets were printed or changed, and no actual LLM request ran during that follow-up. See the later smoke below.
No commit/push or deployment was performed for this follow-up.

## Follow-up — live smoke failure diagnosis — 2026-10-06

The user supplied the provider environment variables and ran two profiles against one case (`reason-dynamics`).
The user's saved artifact `2026-10-06T11-30-23-110Z-live-2130567` records:

- Medium: one valid result, matching the expected intent/rubric label; 4,304.6 ms, 2,468 input / 188 output
  tokens, estimated USD 0.0003408. This single case is not a broader accuracy claim.
- Max: provider failure before structured evaluation. The old adapter discarded HTTP error details, so this
  artifact alone cannot identify which request parameter was rejected. Its 0% scores include the failure.

Added allowlisted HTTP status/code/type/parameter diagnostics to the adapter, engine observations and
benchmark reports. Provider message prose, headers, unknown identifiers and oversized error bodies are
discarded. Known HTTP rejections remain distinguishable from transport failures without a response.
Reports explain that failed requests count as missed labels; they are not evidence of incorrect reasoning.

Executed a max-only reproduction (`pnpm eval:live --profile eval-luna-max --limit 1 --retry 0`):

- The sandbox run did not receive an HTTP response; usage/cost unavailable.
- The network-enabled run made one request and returned **HTTP 400**, `code=unsupported_value`,
  `type=invalid_request_error`, `param=reasoning_effort` in 1,095.0 ms. Artifact:
  `artifacts/evals/2026-10-06T11-38-59-189Z-live-2155058`.
- No token usage was returned, so no billing estimate is asserted for the rejected request.
- No retries, additional model comparison or live chat evaluation ran. Medium/max settings and selection
  remain unchanged; max compatibility is unresolved. Official model documentation lists max, but the
  observed Chat Completions request is rejected. Responses and other effort values remain untested.

Verification after diagnostic changes:

| Command/check | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| Focused provider/benchmark/selection tests | PASS — 29 tests |
| `pnpm test` | PASS — 97 tests; no live provider calls in tests |
| `pnpm eval:dry --all-cases` | PASS — 44 valid fixture outputs and 3 guard rejections |
| `pnpm check:boundaries --source-only` | PASS — 16 client import graphs; generated assets not checked |
| `pnpm build` | FAILED — existing Turbopack worker port-binding restriction, Operation not permitted |

No UI, model selection, environment values, dependency, DB or M4-B changes were made for this diagnosis.

## Follow-up — user-approved Luna xhigh — 2026-10-06

The user requested xhigh after the max rejection. Updated `config/evaluator-profiles.json`:

- Default remains `eval-luna-medium` / `reasoningEffort: medium`.
- Difficult modes (`complex`, `strong_only`) select `eval-luna-xhigh` / `reasoningEffort: xhigh`.
- The old max profile ID is replaced, not aliased to a different effort. Luna capability lists exclude max,
  preventing accidental max requests before transport. Generic provider contracts retain max support.
- The model, endpoint, key references, output ceilings and timeouts are otherwise unchanged. No secret was
  read into logs or edited; no new API adapter or live interview integration was introduced.
- Updated existing selection/wire/CLI tests and current README, EVALUATOR, ARCHITECTURE and env comments.

Executed one live request, with no retry or additional model call:
`pnpm eval:live --profile eval-luna-xhigh --limit 1 --retry 0`.

- PASS: one valid structured evaluation; intent and rubric labels matched `reason-dynamics`.
- Schema, semantic and evidence checks passed; no provider error.
- Latency: 4,573.0 ms; provider-reported input/output: 2,468 / 259 tokens; cached input: 0.
- Estimated cost using registry prices: USD 0.0003763. This is not an invoice or a broader quality benchmark.
- Artifact: `artifacts/evals/2026-10-06T11-47-55-799Z-live-2183872` (gitignored).

Verification for the configuration change:

| Command/check | Result |
| --- | --- |
| Focused selection/provider/benchmark tests | PASS — 29 tests |
| Same one-case live command with `--plan` | PASS — one request planned, no call |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 97 tests, no paid requests in the test suite |
| `pnpm check:boundaries --source-only` | PASS — 16 client import graphs; generated assets not checked |
| `git diff --check` | PASS |
| `pnpm build` | FAILED — same Turbopack worker port-binding restriction, Operation not permitted |

M4-A scope is preserved. Medium/xhigh are the user's chosen benchmark profiles; no benchmark winner,
live escalation or M4-B implementation was selected automatically.

## Follow-up — full static benchmark review — 2026-10-06

The user executed:
`pnpm eval:live --profile eval-luna-medium --profile eval-luna-xhigh --all-cases --concurrency 1 --retry 0`.
Reviewed saved `summary.json` and `cases.json` in
`artifacts/evals/2026-10-06T12-02-43-648Z-live-2227865` without further provider requests.
Recomputed dataset/policy hashes match the artifact. The default dataset is 44 global fixtures plus three
M3 seed examples; it does not automatically load the user's current Supabase-authored examples.

| Recorded result | Medium | Xhigh |
| --- | --- | --- |
| Provider requests / validated results | 44 / 44 | 44 / 43 |
| Intent labels matched | 41/41 | 39/41 |
| Explicit rubric labels matched | 13/18 | 12/18 |
| Confirmed false positives / negatives | 0/10 / 0/8 | 0/10 / 0/8 |
| Misconception precision / recall | 1/5 / 1/1 | 1/5 / 1/1 |
| Mean / p95 latency | 3.03 s / 6.34 s | 4.63 s / 16.17 s |
| Estimated cost using registry metadata | USD 0.00651857 | USD 0.00933257 |

Both profiles rejected the empty, over-limit and duplicate cases before calling the provider. There were
88 actual requests in total, no retries and no provider/transport errors. Total estimated cost was
USD 0.01585114, including reported cached tokens; this is not an invoice or a production cost forecast.
Both classified the nine injection, eight off-topic and two direct-answer fixtures as expected.
These small static samples do not establish general abuse resistance or model superiority.

Findings:

- Exit code 1 is caused by xhigh's `later-contradiction`: schema-valid output failed semantic validation
  with `misconception_without_criterion`. A misconception assessment lacked a matching detected
  misconception linked to that rubric node. The result was rejected before state/progress updates and
  flagged for escalation; no second model was called. Raw invalid output is not retained, so the exact
  offending node/quote cannot be recovered from this artifact. The prompt does not explicitly state
  this linking rule and needs alignment with the existing validator before revalidation.
- Xhigh also classified `Repeat the question.` as clarification instead of meta_interview. The other
  intent miss is the rejected result above, not a second observed intent classification error.
- Both profiles' five rubric disagreements overlap: `wrong-reason-right-name` returns partial while
  correctly detecting its misconception; `hedged-answer` and the identical Drone seed example return
  misconception instead of uncertain; the Camera and Representation seed examples return misconception
  instead of partial. Xhigh has the additional rejected contradiction case.
- The four unexpected misconception detections per profile are the latter four cases. The tentative
  reconstruction response is duplicated across global/seed fixtures. Camera/Representation labels need
  human review: their aggregate-metric claim appears to match the authored misconception criterion even
  though the legacy expected labels say partial/no misconception. Do not reinterpret all four as proven
  model errors, or change expected labels merely to improve scores. Define the boundary between tentative
  hypotheses and asserted misconceptions, and partial-versus-misconception precedence independently.
- Confirmed error rates score only explicitly labelled nodes (10 negative / 8 positive labels). Additional
  confirmed predictions on unlabelled nodes are unscored, not proven correct. Extend reviewed label coverage
  before using zero false positives as a release claim.

This follow-up changes status documentation only. No prompt, fixture labels, model selection, UI, DB,
or live integration was changed. Local artifact/fixture comparison and `git diff --check` were performed;
lint/typecheck/test/build were not rerun for this documentation-only review. The Node module-type warning
is unrelated to the semantic failure. M4-B remains outside the current authorized milestone.

## Follow-up — grading policy and annotation refinement — 2026-10-06

The user authorized preparing better examples, defining the status boundaries, and aligning prompts,
validators and offline tests. Implemented within M4-A, without paid provider calls or live chat changes:

- `grading-policy.ts` defines provider-independent policy `2026-10-06.2`. Hedging is distinct from weak
  reasoning; a tentative unsupported proposal differs from an explicit sufficiency claim; contradictions
  use prior/current evidence rather than invented misconception IDs. Clarification and repeat-question
  intent boundaries are explicit. Fixture text/labels are never put into the policy or evaluator input.
- Compact packages now retain misconception labels and authored detectionNotes as detectionCriteria.
  The prior builder lost the existing Drone reconstruction-sufficiency restriction. Administrative rubric
  notes, reference answers, full hints, examples and provenance remain excluded.
- Validation rejects positive partial credit on nodes linked to active detected misconceptions, unanchored
  misconception detections and unsupported alternative-valid feedback. Separate valid nodes retain credit.
  Existing schema/evidence/ID/conflict protections remain fail-closed. Validation cannot prove technical truth.
- `curated.ts` provides **83 AI-authored, not human-reviewed, proposed cases** over three existing problems:
  59 calibration (three guards) and 24 holdout. Every reasoning case labels all nodes: 151 node labels total.
  Examples include explicitly justified hedging, partial objectives, sufficiency errors, quoted/rejected
  misconceptions, valid alternatives, technical questions, cross-turn errors/retractions/corrections and abuse.
- All cases have rationale, family, split, review priority and provenance. Exact duplicate inputs and families
  crossing splits are rejected. The duplicated Drone response appears once. Camera/Representation corrections
  record the superseded IDs and criteria-based reasons; seed and hosted DB labels are unchanged.
- CLI defaults to calibration, including when `--all-cases` is used. Holdout must be explicitly selected.
  `--dataset legacy` retains the original 47 messages/labels using the current engine. Report contract v2
  adds annotation hashes, split metrics, per-status accuracy, node coverage, unscored confirmations and
  rejected-case issue codes. Old/new aggregate scores are not directly comparable.
- `pnpm eval:review` exported 19 calibration boundary cases, with prior/current text, criteria, expected labels
  and reasons, to ignored `artifacts/evals/review/calibration-boundary.md`. It is static fixture data only;
  the export never accesses Auth/DB/provider credentials. All annotations remain `needs_human_review`.
- Added 11 focused regression tests and updated affected existing tests. Model registry/selection, User/Admin UI,
  source contracts, migrations, published packages, SDKs and runtime interview behavior are unchanged.

Executed final verification:

| Command/check | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 108 tests, no paid provider requests or hosted DB writes |
| `pnpm eval:dry --split all --all-cases` | PASS — 83 cases: 80 validated scripted outputs, three guard rejections; 151/151 fixture node labels |
| `pnpm eval:dry --dataset legacy --all-cases` | PASS — original 47 messages/labels remain usable (44 scripted evaluations / three guards) |
| `pnpm eval:review` | PASS — 19 calibration boundary cases exported offline |
| Medium + xhigh calibration `--all-cases --concurrency 1 --retry 0 --plan` | PASS — 59 cases/profile, upper bound 118 requests; none made |
| Same holdout plan with `--split holdout` | PASS — 24 cases/profile, upper bound 48 requests; none made |
| `pnpm check:boundaries --source-only` | PASS — 16 client import graphs; generated assets not verified |
| `git diff --check` | PASS |
| `pnpm build` | BLOCKED — same Turbopack CSS worker process/port binding error, Operation not permitted |

Final offline artifact: `artifacts/evals/2026-10-06T13-50-38-759Z-dry-583`.
Legacy offline artifact: `artifacts/evals/2026-10-06T13-47-25-195Z-dry-583`.
After clarifying the prompt's mixed uncertain/positive-node feedback wording, the 11 focused annotation tests,
full 83-case dry run and review export were rerun successfully.
Dry-run 100% labels indicate mock transport/contract consistency only, not model quality. The two splits share
an AI author and have not received independent domain review. A revised live run, independent labels and a
successful normal-terminal production build remain outstanding. No actual provider call, hosted DB mutation,
commit/push, deployment or M4-B work was performed during this refinement.

## Follow-up — full v2 calibration benchmark — 2026-10-06

The user explicitly authorized running the full set instead of limiting it to ten cases. The selected set was
all **59 calibration cases per profile**, with the 24 holdout cases left unqueried for subsequent evaluation
after the criteria and labels have been reviewed. The profile/request plan was printed before paid calls.

Executed command:

```bash
pnpm eval:live --profile eval-luna-medium --profile eval-luna-xhigh \
  --split calibration --all-cases --concurrency 1 --retry 0
```

Result: **exit code 0**, 56 provider requests and three correctly pre-guarded cases per profile, **112 actual
paid requests total**, no retries or second-model chaining. All 112 responses passed schema, semantic and
evidence validation. Policy `2026-10-06.2`, registry and proposed labels were unchanged throughout the run.

| Metric | Luna medium | Luna xhigh |
| --- | --- | --- |
| Valid results | 56/56 | 56/56 |
| Intent agreement | 56/56 | 56/56 |
| Rubric status agreement | 92/96 (95.8%) | 94/96 (97.9%) |
| Confirmed false positives against proposed labels | 0/73 | 1/73 |
| Confirmed false negatives against proposed labels | 2/23 | 1/23 |
| Misconception precision / recall | 5/5 / 5/5 | 5/5 / 5/5 |
| Expected escalation recall | 3/3 | 3/3 |
| Extra escalation recommendations against proposed labels | 1/53 | 2/53 |
| Average / p50 / p95 latency (ms) | 3368.6 / 3068.6 / 6999.1 | 4579.5 / 3207.5 / 12694.2 |
| Estimated USD | 0.00872331 | 0.01240431 |

Input/output usage totals: 344,696 / 28,940 tokens, including 309,022 cached input tokens. Total estimated
cost is **USD 0.02112762**, calculated from configured prices and provider usage, not an invoice. No provider,
schema or semantic failures occurred. Rubric label coverage was 96/96 for each profile, with zero unscored
confirmed predictions. Of those labels, 57 are unseen; inspect per-status scores rather than relying on the
aggregate alone.

Artifact: `artifacts/evals/2026-10-06T14-03-09-028Z-live-2531145/` (`summary.json`, `cases.json`, `report.md`).
Generated files remain gitignored and omit raw prompts, provider output, evidence quotes and credentials.

Remaining calibration disagreements, **not automatically proven model errors**:

- Both profiles omit `drone_shortcuts` on `drone-validation-complete`, whose explicit z ablation is labelled
  confirmed. This is the shared confirmed false negative and merits checking overlapping-node recognition.
- Xhigh additionally confirms `drone_shortcuts` on `drone-hedged-justified`, labelled unseen. The supplied
  criterion includes the broad phrase "variation in dynamics"; review that criterion/label boundary before
  calling this definitively wrong or changing the expected label to match the model.
- Medium marks `valid-alternative` / `drone_dynamics` unseen rather than partial,
  `auxiliary-reconstruction` / `drone_dynamics` partial rather than confirmed, and
  `later-contradiction` / `drone_signal` unseen rather than uncertain.
- Both recommend escalation for `partial-wrong-conclusion` (ambiguous evidence); xhigh also recommends it
  for `clarify-challenge` (technical challenge). The proposed labels expect no escalation; the policy and
  annotation boundary needs human review before treating these conservative recommendations as errors.

All 59 annotations remain AI-authored drafts awaiting human review. This is one calibration pass on three
static problems, not an expert-reviewed production-quality certificate or an independent holdout result.
The prior run had different labels, coverage and prompt/package criteria; its aggregate scores are not a
controlled before/after comparison. No model was newly selected, no prompt or label was tuned from this run,
and no automatic rerun was performed.

This follow-up updated status documentation only, in addition to the ignored benchmark artifacts. The full
live command, local case/metric analysis and `git diff --check` were executed; lint/typecheck/test/build were
not rerun for this documentation-only change. No DB mutation, UI change, deployment or M4-B integration.
