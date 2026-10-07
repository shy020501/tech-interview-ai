# Evaluator engine, benchmarks and live runtime — M4-B

The M4-A engine now serves authenticated interview attempts through attempt-scoped Server Actions.
The existing User/Admin layout is preserved. Models return structured judgments only; the server owns
feedback, progress, hints and completion behavior. Source authoring stays manual.

The user-selected registry maps primary evaluation to `eval-luna-medium` and escalation to
`eval-luna-xhigh`. These are explicit configuration choices, not automatically selected benchmark winners.
See [M4-B setup and browser checks](M4B_VERIFICATION.md) before enabling the new code against hosted Supabase.
Historical M4-A results are in [M4A_STATUS](history/M4A_STATUS.md); label review/holdout are still pending.

## 1. Contract and trust boundaries

```text
Pre-guards → Compact package / input builder → EvaluatorProvider
    → JSON parse + schema validation → semantic/evidence validation
    → ValidatedEvaluation → deterministic state reducer → progress / completion
                            ↘ bounded independent strong evaluation (live only)
```

The LLM is a **restricted evaluator, not a chatbot**. There is no generic `/api/chat`. Live submissions use owned-attempt Server Actions.
An adapter sends a fixed evaluation policy, compact criteria, accumulated state and a bounded number of
user messages. It provides no tools, browser, database access, code execution or external actions.
It accepts only structured labels and evidence; there is no answer, feedback prose, confidence or progress field.
The full result is internal. The live service maps permitted categories to server-owned response templates.

`src/lib/evaluator/contracts.ts` defines the version-1 M4 engine contract. M3's persisted
`src/types/evaluation.ts` and the existing authoring UI/schema are unchanged. The benchmark loader converts
their reviewed examples to labelled cases. M3 examples **do not contain intent labels**: intent is unscored
for those examples, rather than inventing ground truth. Legacy M3 mock state is not treated as evaluated evidence: the first live reasoning assessment initializes the engine state.

`live/server.ts` creates the authenticated DB gateway and configured transport. `live/runtime.ts` injects
storage/providers so the actual runtime can be tested without paid calls. Pure modules remain Node-testable.
`check:boundaries` rejects evaluator internals in client graphs; Server Action references are a boundary, not
a browser import of their implementation. DB ownership and public/private separation remain enforced.

## 2. Compact input, context and caching

`buildCompactPackage` checks version identity and explicitly selects:

- scenario, question and assumptions;
- rubric IDs, labels, sufficient evidence criteria, weights and prerequisite IDs;
- relevant alternative descriptions/linked nodes and misconception labels/descriptions/linked nodes;
- authored misconception `detectionNotes`, projected as optional `detectionCriteria` (technical applicability rules);
- required node IDs and alternative completion groups.

It excludes reference answer, full hints, administrative author/reviewer notes, examples, provenance and source metadata.
Misconception detection conditions are necessary evaluation criteria, not administrative notes. The earlier
builder omitted the Drone rule requiring an explicit reconstruction-sufficiency claim; policy v2 preserves it.
Criteria use `sufficientEvidenceDescription` (description is a compatibility fallback), not every rubric field.
This is deterministic projection, not LLM summarization. Long authoring packages may need shorter reviewed
criteria; oversized packages fail rather than silently truncating their meaning. No benchmark case is injected
as a few-shot example. The mock fixture playback is a test transport and never part of a live prompt.

Defaults: 4,000 current-message characters, up to 4 recent user messages / 6,000 characters, 40,000 compact
package characters, 60,000 total input characters. Bounds are configurable builder/guard settings, not final
product thresholds. CLI `MAX_EVALUATION_MESSAGE_CHARS` overrides the message limit (1–20,000).
Context is chronological, excludes current/future messages and repeated IDs, and keeps whole messages so
evidence quotes remain exact. Optional relevant-message IDs take priority within the same bounds.
Do not pass assistant feedback or hints as user evidence. No automatic full-conversation inclusion exists.

The policy + compact problem forms a stable prefix. The variable suffix holds state, recent messages and
`UNTRUSTED_CURRENT_USER_MESSAGE`. State in the prompt has recent supporting/conflicting message IDs and
statuses, not an entire conversation. Provider caching is not forced; reported cached tokens are recorded.
The live DB claim pins the version, message sequence and base revision. Up to four already-released hints
are separately labelled `REVEALED_SYSTEM_HINTS`, within the same total input budget; they are never user
evidence. Hint IDs and selected recent-message IDs are recorded with each run. Policy `2026-10-06.3` adds
this provenance instruction to the earlier grading policy; it does not create a learning-mastery score.

## 3. Intent and abuse handling

| Intent | Meaning / permitted classification |
| --- | --- |
| `reasoning` | Assess evidence against the supplied rubric; valid alternative paths allowed |
| `clarification` | Problem assumptions/scope/technical challenge; classify only, do not answer |
| `meta_interview` | Stuck, unsure, thinking aloud, repeat-question request; never an abuse strike |
| `hint_request` | Textual request; no hint returned by this evaluator |
| `direct_answer_request` | Simple request for the correct solution; no answer returned |
| `off_topic` | Unrelated tasks, including code/tutorial requests using problem vocabulary |
| `prompt_injection` | Hidden prompt/rubric/answer extraction, role overrides, fake finish, nested/schema attacks |
| `uncertain` | Unclear intent; escalation candidate |

Only `reasoning` may carry rubric, misconception or contradiction assessments. Other intents must have empty
lists. Clarification has restricted `kind` and `relatedToProblem` metadata. Feedback categories are a closed
set: valid_progress, insufficient_reasoning, possible_misconception, contradiction, alternative_valid_path,
clarification, meta_interview, hint_requested_in_chat, direct_answer_requested, off_topic, prompt_injection,
uncertain. There is no free-form explanation field in the provider result.

Prompt text alone is not a security boundary. Even a misbehaving provider cannot return additional answer
fields, execute a tool or directly update state. Schema and semantic/evidence validation fail closed.
These checks cannot prove that a technically wrong statement deserves `confirmed`; real model false-positive
rates must continue to be measured during controlled live testing. Fixture playback does not establish injection resistance.

Pre-guards are pure, configurable functions for inactive attempts, empty/long/exact duplicate messages,
recent request count, evaluations per attempt/day, input-token budget and consecutive abuse strikes.
The standalone guard simulation includes an optional input-token budget. Durable live rate limits, quota,
strike/cooldown accounting and current defaults are described in section 10. A denied live claim makes no
provider call. Token usage is logged; a daily token quota is not yet enforced.

## 4. Validation and failure behavior

The adapter returns untrusted text. `schema.ts` uses a small explicit JSON-Schema subset (objects, arrays,
types, enums, required/extra keys, unions and text/list limits). The same schema supplies the provider's
structured-output request and local validation. It is not a general-purpose JSON Schema implementation.
Malformed JSON, code fences, extra fields, invalid enums and oversized responses are rejected.

Semantic checks cover known node/misconception IDs, unique assessments, evidence message IDs, nonempty
verbatim quotes present in supplied user messages, and current-message evidence for every non-unseen
assessment/contradiction/misconception. Old evidence alone cannot change a node in a new turn. Misconception
assessments need a linked known criterion; a confirmed OR partial node with a linked detected misconception is invalid.
Every detected misconception must anchor to at least one related misconception/contradicted assessment.
Alternative-valid feedback requires a supporting assessment linked to an available alternative.
Contradictions require matching contradicted assessments. Intent/feedback/clarification/escalation must agree.

Policy `2026-10-06.3` in `grading-policy.ts` defines the boundary explicitly:

| Status | Proposed grading rule |
| --- | --- |
| unseen | No relevant new evidence; omission never resets previous state |
| partial | A technically valid part of the criterion is justified; a bare technique name is insufficient |
| confirmed | Sufficient reasoning, including valid alternatives; hesitant language alone does not reduce credit |
| uncertain | Relevant but too underspecified to establish valid partial reasoning or an asserted misconception |
| misconception | An asserted claim meets an authored detection condition; quotation, negation, correction and auxiliary use do not automatically qualify |
| contradicted | Explicit conflicting assertions in this turn or against supplied earlier reasoning, with current evidence |

An active misconception takes precedence over positive credit on its related assessed nodes; a separate valid
node can still earn credit. Explicit conflict uses contradicted. A known misconception must use its supplied ID;
an uncatalogued error is uncertain/escalation or a supported contradiction, never an invented catalog entry.
Uncertain intent requires escalation; an underspecified node alone need not escalate. Technical uncertainty
questions are clarification; argued claims remain reasoning even when phrased as questions. Repeat-question
requests are meta_interview. Prompt and validator express the same structural contract; neither proves technical
truth from a verbatim quote. Inspect the per-case reasoning before accepting these AI-authored policy proposals.

Validated results are frozen and registered in a private WeakSet before the reducer can use them. Raw,
copied/forged or subsequently mutated results cannot change state. Revalidate deserialized results before
using them; the runtime validation marker is intentionally not persistent authority.

Errors are distinct: provider_timeout, provider_rate_limit, provider_auth_error, provider_error,
malformed_output, schema_validation_error, semantic_validation_error, internal_error.
No failure becomes fabricated `valid_progress`. Config allows zero or one structured-output retry (default 0),
only for malformed/schema failures. Suspicious evidence, semantic failures, HTTP/auth/rate/timeout failures
are not retried. The prior invalid output is not replayed as context. Every request is measured, including retries.

HTTP failures retain `providerDiagnostic` with status and allowlisted `code`, `type`, and `param` identifiers.
The adapter reads at most 16 KiB of error data and discards error prose, headers and unknown identifiers,
which could echo keys or input. Missing/HTML/oversized error bodies retain the known status. Network errors
without an HTTP response have no HTTP diagnostic. `summary.json` groups these under `providerFailures`;
the CLI prints them so an unsupported parameter is distinguishable from an auth, quota or server rejection.
This does not add HTTP retries, model substitution or a success fallback.

## 5. Reducer, progress, completion and hints

State includes contract/problem version, revision, last sequence and per-node status, supporting/conflicting
message IDs, last sequence and assessment IDs. The reducer is pure and does not mutate its input.
It rejects older/equal sequences and a stale base revision; this also prevents two concurrent results based
on the same prior state from overwriting each other. M4-B additionally claims one active evaluation per
attempt in PostgreSQL and validates the base revision/lease/token at finalization; stale output never commits.

Explicit evidence can move confirmed → partial/uncertain/misconception/contradicted, or resolve a prior
conflict through a supported correction. Historical evidence is retained. Omitted/unseen means no new
evidence and does not erase earlier learning. Uncertain/contradicted nodes remain unresolved.

Progress is `100 * sum(weight * contribution) / sum(weight)`, rounded to two decimals. Zero total weight
returns 0. Default contributions: confirmed 1, partial 0.5, all others 0. These are configurable MVP defaults,
not model outputs or product acceptance thresholds. Progress may decrease when reasoning changes.

Completion preserves M3 semantics: **all required nodes AND any one complete alternative group**, or just
required nodes when groups are empty. Empty criteria never complete; only confirmed/resolved nodes count.
There is no progress-threshold completion rule added to the M3 schema. The live service stores core-complete
and displays a notice. Finish remains the user's explicit session completion, even with unresolved nodes.

The pure hint target selector skips confirmed nodes and used hints, prioritizes misconception/conflict
blockers, visits unmet prerequisites first and chooses the weakest unused hint for an eligible target.
No eligible hint returns null. It returns IDs only. The gated live hint service checks the selected ID against
the pinned private package and atomically records one hint and system_hint message. It changes no progress.

## 6. Escalation

`shouldEscalate` recommends review/stronger evaluation for explicit model requests (including an unknown
approach), uncertain intent, semantic/schema/evidence failure after allowed retry, contradictions, downgrades
from a previously confirmed node, and optional complex/strong_only problem modes. Policy switches are
configurable. No self-reported confidence threshold is used.
The offline benchmark only simulates this recommendation; it does not chain models. The live orchestrator
may call the configured escalation profile once (plus its optional structured retry), using the same original
input without the primary conclusion. Only the final validated result may change state. See section 10 for
unreliable-result handling and failure policy. Admin QA stores human decisions without rewriting attempts.

## 7. Model configuration and reasoning effort

Use the installed Node.js 24 and pnpm. No new SDK/framework/dependency is required.

The CLI reads `config/evaluator-profiles.json` by default. This committed, secret-free configuration follows
the user's explicit model choice:

| Profile | Model | Effort | Selection | Output-token ceiling | Timeout |
| --- | --- | --- | --- | --- | --- |
| `eval-luna-medium` | `gpt-6-luna` | `medium` | Default | 16,000 | 60 seconds |
| `eval-luna-xhigh` | `gpt-6-luna` | `xhigh` | `complex` / `strong_only` | 32,000 | 120 seconds |

**Observed compatibility — 2026-10-06:** medium returned one valid evaluation. A max-only reproduction
returned HTTP 400, code `unsupported_value`, type `invalid_request_error`, param `reasoning_effort`.
The [model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) lists max, but that does
not override the actual endpoint rejection. The user then chose xhigh. Its one-request live smoke passed
schema/semantic/evidence validation and matched the expected intent/rubric labels: 4,573.0 ms, 2,468 input /
259 output tokens, estimated USD 0.0003763. See STATUS for the artifact and verification record.
The old `eval-luna-max` ID is no longer configured; use `eval-luna-xhigh` or `--evaluation-mode complex`.
Both configured profiles exclude max from their capability list, so an accidental max configuration fails
before a paid request. The generic contract still permits max for other explicitly compatible providers.
Responses API compatibility remains untested.

The ceilings cover reasoning **and** visible JSON tokens, not expected usage. These initial configurable
limits allow more space than the generic 2,000-token example; actual latency, adequacy and quality still need
a live benchmark. Both profiles are enabled for explicit CLI runs and configured live selection, use strict JSON schema, omit temperature,
and share provider A's environment variables. Loading configuration never calls an API.

`selection.defaultProfileId` and `selection.difficultProfileId` own the mapping. The pure
`selectEvaluatorProfile(registry, mode = 'default')` helper resolves it without hardcoded model names.
The caller supplies trusted `default`, `complex` or `strong_only` metadata. User text, public problem
difficulty and model confidence do not directly select a provider. The live escalation policy, not user text, chooses the configured strong profile.
Missing/disabled profiles and invalid modes fail; no fallback selects a different profile silently.

Given a prepared `EvaluationInput` and provider, server/CLI code can use:

```ts
import configuration from './config/evaluator-profiles.json' with { type: 'json' };
import { parseEvaluatorRegistry, selectEvaluatorProfile } from './src/lib/evaluator/registry.ts';
import { evaluate } from './src/lib/evaluator/engine.ts';

const registry = parseEvaluatorRegistry(configuration);
const defaultProfile = selectEvaluatorProfile(registry);            // medium
const difficultProfile = selectEvaluatorProfile(registry, 'complex'); // xhigh

// For ONE evaluation: choose using caller-supplied input.evaluationMode, then evaluate once.
const profile = selectEvaluatorProfile(registry, input.evaluationMode);
const run = await evaluate(input, provider, profile);
```

The imports above are relative to a repository-root script. Next server modules can use the exports from
`src/lib/evaluator/server.ts`. An ordinary schema retry preserves the same profile/effort. `evaluate()` itself
returns an escalation recommendation; `live/runtime.ts` performs the bounded second call when needed.

For additional providers, copy the disabled generic `config/evaluator-profiles.example.json` to the ignored
`config/evaluator-profiles.local.json`, configure it, then pass `--registry config/evaluator-profiles.local.json`
explicitly. A local file never silently overrides the committed selection. It must include `selection` to
use the selection helper/`--evaluation-mode`; explicit `--profile` comparisons also support older registries.
Each profile has an ID, adapter/provider type, model, base URL env name, key env name, output-token/timeout
limits, role and capability flags. Set the provider's exact model ID and enable only intended profiles.
Role is primary_candidate/escalation_candidate/benchmark_only. Live routing uses explicit registry selection
or PRIMARY_EVALUATOR_PROFILE / ESCALATION_EVALUATOR_PROFILE, never an arbitrary client profile.

The implemented adapter type is `openai_compatible`. Configure `supportsJsonSchema`, `supportsJsonMode`,
`supportsUsageReporting`, `supportsTemperature`, and `outputTokenParameter` (`max_completion_tokens` or
`max_tokens`) according to the provider/model. JSON-schema is preferred when declared supported; otherwise
JSON mode, otherwise JSON-only prompting with the same strict server validator. Unsupported modes are not
silently probed/fallen back to. Temperature 0 is sent only when enabled, and does not guarantee reproducibility.

Optional `reasoningEffort` is validated against `capabilities.supportedReasoningEfforts`, an explicit list of
values supported by that model/provider. An unsupported value fails before fetch. The compatible adapter
sends it as Chat Completions `reasoning_effort`. Omit both fields for providers without this capability;
there is no global default imposed on other providers. The configured Luna capability lists include `none`,
`low`, `medium`, `high`, `xhigh` and exclude the observed unsupported max value. Medium and xhigh have been
smoke-tested; both profiles set `supportsTemperature: false` to avoid unsupported sampling options.
The API uses lowercase `xhigh`. Changing effort does not change the model's token price.

Set values in the existing ignored `.env.local` without replacing Supabase settings:

```dotenv
EVAL_PROVIDER_A_BASE_URL=https://api.openai.com/v1
EVAL_PROVIDER_A_API_KEY=YOUR_PRIVATE_KEY
```

The adapter appends `/chat/completions`. It requires HTTPS, refuses URL credentials/query/fragment and
redirects, and reads secrets only at execution. Never use NEXT_PUBLIC_ for evaluator variables.
Optional `headerEnv` maps a header name to an environment-variable name; it cannot replace authorization,
host, cookies or content type. Do not put header values or secrets in JSON. The local registry and generated
artifacts are ignored; the committed registry stores no key/header values. Future provider-specific adapters
implement EvaluatorProvider and are registered in the CLI factory; reducers/metrics do not change.

Optional `pricing` metadata: currency `USD`, inputPerMillion, outputPerMillion, cachedInputPerMillion,
asOf (`YYYY-MM-DD`). The Luna profiles record the verified Standard short-context prices as of 2026-10-06:
$0.10 input / $0.50 output / $0.01 cached input per million tokens. Other service tiers/long context can differ;
update metadata when the provider or prices change. The generic example assumes no prices. Usage reporting
distinguishes exact (reported by provider), estimated (future adapter estimates) and unavailable. The current
adapter never invents estimated counts. If discounted cache pricing is configured but cache usage is missing,
cost is unavailable. Without discounted cache pricing, input price applies to all reported input tokens.
“Exact usage” does not mean the price estimate equals a provider invoice. Chat Completions `completion_tokens`
already includes reasoning tokens; those are neither subtracted nor counted twice.

Transport reference checked for the shared wire format:
[Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
[Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
Luna effort, features and pricing:
[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[GPT-6 parameter compatibility](https://developers.openai.com/api/docs/guides/latest-model),
[Reasoning tokens](https://developers.openai.com/api/docs/guides/reasoning).
Other providers may support different subsets. This is a compatibility adapter, not a claim of vendor parity.

## 8. Run benchmarks

Completely offline fixture checks:

```bash
pnpm eval:dry --limit 10
pnpm eval:dry --all-cases
pnpm eval:dry --split all --all-cases
pnpm eval:review
pnpm eval:live --help
```

Static dataset `reasoning-v2`: **83 AI-authored proposed cases**, 59 calibration (including three pre-guards)
and 24 reserved holdout cases across Drone, Camera and Representation problems. **No case is claimed to be
human-reviewed gold.** Default selection is calibration; `--all-cases` means all cases in the selected split.
Use `--split holdout` deliberately for final evaluation; `--split all` is useful for offline harness verification.
The first 10 calibration cases remain a representative smoke subset. Fixtures cover obvious/subtle off-topic tasks,
prompt/rubric/answer extraction, role/nested/schema overrides, fake completion, direct answer and hint requests,
valid clarification/technical challenges, being stuck, contradictions, corrections, alternatives and hedged reasoning.
Dry mode replays scripted outputs; its quality metrics are **harness checks, not actual model scores**.

Every reasoning case labels all nodes and records an explanation, family, split, author and review priority.
Exact repeated inputs within a problem/context and families crossing splits are rejected. Semantic similarity
still needs human review; the two subsets were authored by the same AI, not independent annotators. If holdout
results guide prompt changes, treat those cases as calibration and prepare a fresh reserved set.

`pnpm eval:review` exports 19 calibration boundary cases to
`artifacts/evals/review/calibration-boundary.md`, with static question/criteria, relevant previous/current
messages, expected labels and rationales. It never loads secrets, contacts the DB or calls a provider. Export
all calibration cases with `--priority all`; holdout requires `--split holdout`. These ignored review files
contain synthetic fixture text, unlike live result artifacts which omit message text and criteria.

The original 47 messages/labels remain available with `--dataset legacy`. Seed/DB examples were not edited.
Legacy runs use the current prompt/input builder, so they are not a byte-for-byte replay of the original API run.
The duplicated Drone example is represented once in v2. Proposed Camera/Representation label corrections
carry the original case IDs in `supersedes` and explicit criteria-based rationales. Human review is pending;
provider agreement is not accepted as proof. Original live artifacts remain intact.

Paid calls require explicit live mode and an enabled `--profile` or `--evaluation-mode` selection.
The latter selects one profile for the entire comparison run; it does not overwrite individual case modes
or change their escalation labels. Default limit is 10, concurrency 1 and
retry 0. The CLI prints profiles × cases × (1 + retries) as an upper request bound before calls. Guards can
reduce actual calls. The safety limit of 4 workers avoids accidentally launching high concurrency; choose 1
when comparing latency. `--plan` stops before provider calls and works without a provider key.

```bash
# Plan and a maximum ten-request smoke run for ONE configured model
pnpm eval:live --evaluation-mode default --limit 10 --plan
pnpm eval:live --evaluation-mode default --limit 10

# Explicit difficult profile; also available as --profile eval-luna-xhigh
pnpm eval:live --evaluation-mode complex --limit 10 --plan
pnpm eval:live --evaluation-mode complex --limit 10

# Compare the same ten cases under both efforts: up to 20 requests, no retries
pnpm eval:live --profile eval-luna-medium --profile eval-luna-xhigh --limit 10 --plan
pnpm eval:live --profile eval-luna-medium --profile eval-luna-xhigh --limit 10

# Full calibration: up to 59 requests, normally 56 after three guards
pnpm eval:live --profile eval-luna-medium --split calibration --all-cases

# Reserved evaluation after fixing policy; up to 24 requests for one model
pnpm eval:live --profile eval-luna-medium --split holdout --all-cases --plan

# Historical message/label set, current engine; no paid call in this example
pnpm eval:dry --dataset legacy --all-cases

# Explicit full comparison plan; optional structured retry doubles the upper bound
pnpm eval:live --profile eval-luna-medium --profile eval-luna-xhigh --all-cases --retry 1 --concurrency 1 --plan
```

All selected case inputs are preflighted before provider calls; oversized/malformed input fails without
partially executing a paid run. The over-limit guard fixture follows the configured character limit.
Use `--profile all` only when you intend to run every enabled profile. Missing/disabled profiles, unknown
adapters, placeholder model IDs and missing keys fail before paid requests. Ordinary lint/typecheck/test/build
never load live benchmarks or invoke a provider.

Actual M3 DB examples use the existing publishable key, a terminal-only admin email/password sign-in,
verified Auth identity and profiles.role plus RLS. Password input is hidden; credentials remain in memory;
the CLI closes its own session afterward. It reads explicit versions only and makes **no database writes**.
It does not fetch reference answers or hint ladders. No service-role key is supported.

```bash
pnpm eval:dry --dataset supabase --version pv-drone-1 --all-cases
pnpm eval:live --profile eval-luna-medium --dataset supabase --version YOUR_VERSION_ID --limit 10
pnpm eval:live --profile eval-luna-medium --dataset combined --version YOUR_VERSION_ID --all-cases
```

`combined` uses the selected curated split plus selected DB examples, without automatically appending the seed's
legacy examples. Static cases retain their own problem criteria. DB labels are unmodified, have no inferred human
review status and are reported as an unassigned split; they may contain duplicates/partial labels requiring review.
Repeat `--version` for up to 20 versions. `--plan` with a DB dataset still signs in to read/count the examples.
Static tests do not require Supabase. The DB loader's role/mapping behavior is tested with injected clients;
hosted admin dataset loading was not performed without a provided admin session/password.

## 9. Metrics and artifacts

Results are stored under `artifacts/evals/<timestamp>-<mode>-<pid>/` (gitignored, owner-readable files):
summary.json, cases.json and report.md. Per-case reports store label projections, issue codes, request metrics,
guard outcome, simulated state/progress/completion and escalation recommendation. They omit raw responses,
quotes, full prompts, message text, private criteria, API keys, endpoint values and request headers.
Summary contract v2 records profile model/effort/capabilities/prices, grading-policy version and hashes of the dataset,
annotation metadata, policy and registry for
repeatability. CLI plans also print the selected model/effort before any request.
`splitProfiles` separates calibration, holdout and unassigned DB/legacy metrics. Reports show annotation review
status, node-label coverage and unscored confirmed predictions. `rubricByExpectedStatus` separates each status's
accuracy so numerous unseen nodes do not hide errors on misconception/partial/confirmed. Failed validations
also print the case ID and safe issue codes. Annotation prose is omitted from live results and from model inputs.
Do not treat a benchmark result as persistent attempt state or user-facing content.

| Metric | Definition |
| --- | --- |
| Intent accuracy | Correct labelled intent / cases with an intent label; failures count as incorrect |
| Intent detection | Each class's one-vs-rest accuracy, positive recall and false-positive rate |
| Rubric status accuracy | Correct explicitly labelled nodes / labelled nodes; missing assessment in valid reasoning = unseen |
| Rubric label coverage | Labelled nodes / all nodes in reasoning or legacy node-labelled cases |
| Unscored confirmations | Predicted confirmed nodes without an expected label; reported separately, never assumed correct |
| Confirmed false positive rate | Predicted confirmed on expected non-confirmed / expected non-confirmed nodes |
| Confirmed false negative rate | Expected confirmed not predicted confirmed / expected confirmed nodes, including failures |
| Misconception precision/recall | Set intersection over predicted / expected misconception IDs; zero denominator = null |
| Escalation recall/unnecessary rate | Policy recommendation among expected-escalation / expected-no-escalation cases |
| Schema/semantic failure rate | Failed requests / all provider requests, including retries |
| Retry rate | Evaluations retried / attempted evaluations |
| Provider error rate | HTTP/network/auth/rate/timeout failures / requests (internal errors separately reported) |
| Latency | Mean and nearest-rank p50/p95 of evaluation wall time including retries, excluding queue wait/guards |
| Tokens/cost | All requests including retries; unknown usage/prices remain unavailable, with coverage counts |

Guarded cases are scored separately and excluded from model-accuracy denominators. Missing M3 intent/unlabelled
rubric nodes are unscored, not fabricated. Invalid results are never scored as successful unseen assessments.
Evidence is checked against source messages, not matched to the expected result's explanation text.
Cost shows known subtotal, coverage and total only when every request is accounted for. No false zero-cost
claim is made when usage is unavailable. Overall valid-result rate must be read with false-positive metrics:
a model that returns nothing can have low false positives while failing recall/reliability.

No acceptance threshold or benchmark winner is chosen. The user-selected medium/xhigh configuration is a starting
point. Review failure cases, false confirmations, valid-alternative
handling, clarification false alarms, latency and cost before widening live usage.
The v2 dataset, node coverage and grading policy differ from the initial 47-case benchmark; their aggregate
scores cannot be presented as an apples-to-apples model improvement. Pending human annotations and a fresh
live run remain necessary evidence. See [annotation review notes](../benchmarks/README.md).

## 10. Live runtime, setup and trust boundary

`EVALUATOR_MODE` must explicitly be `live` or `mock`. Missing/disabled profiles, missing provider variables,
or a missing runtime capability return a configuration error; there is no automatic mock/model fallback.
Mock is a labelled development fixture and is rejected with NODE_ENV=production. An attempt that has already
used one mode cannot switch modes; finish it and start another. Legacy attempts with no mode can start live.

Keep the existing Supabase project, session clients and user/admin roles. Apply incremental
`20261006000400_m4b_live_evaluation.sql` through the existing GitHub migration workflow. Then:

```bash
pnpm eval:setup live
# For explicitly scripted development testing instead: pnpm eval:setup mock
```

This local command preserves existing env entries, creates/keeps a random 256-bit `EVALUATOR_RUNTIME_SECRET`,
sets the selected mode in ignored `.env.local`, and generates ignored
`artifacts/evals/setup/runtime-capability.sql`. It prints no secret and calls no database/API.
A trusted SQL operator applies **only that hash-configuration SQL** after the migration. Restart the local
server. The hash is stored in unexposed `app_private.evaluator_runtime`; do not expose that schema to Data API.
Rotation requires replacing the local secret and applying its new hash together. Do not commit either file.

The reason for this additional server capability: an ordinary authenticated Supabase RPC that returns a
private rubric or accepts a replacement reasoning state could otherwise be invoked directly from a browser.
Every evaluator operation therefore checks **both** this server-only capability and auth.uid()/attempt ownership.
It uses the user's normal session and publishable key, not a Supabase service-role key. This limited capability
cannot make generic SQL queries or access another user's attempt. No API, including Admin actions, returns it.
DB functions use empty search_path, restricted EXECUTE grants and row locks; direct private table writes stay revoked.

The existing medium/xhigh registry selection is the default. Optional `PRIMARY_EVALUATOR_PROFILE` and
`ESCALATION_EVALUATOR_PROFILE` reference enabled IDs in the same registry. Business logic contains no model name.
The live provider and offline benchmark share input construction, schema, evidence/semantic validation,
reducer, cost calculations and adapter. Live-specific orchestration is not a second evaluator implementation.

## 11. Submission, ordering, retry and failure

1. Server Actions accept attempt ID, message and client request UUID (retry also identifies the saved evaluation).
   They verify the session and simple shape/length; DB claim rechecks ownership, status and durable guards.
2. A transaction locks user profile then attempt. One `running` evaluation per attempt is enforced by a unique
   index. Same request replays return its existing state; another active request is rejected before a paid call.
3. Claim stores the user message, immutable version, sequence/base revision, mode and expiring claim token.
   A failure after this step preserves the user's message.
4. For each actual provider call, `assessment_runs` first reserves a row under the user lock and daily budgets.
   Every retry/escalation has a separate observation. No whole conversation, reference answer or examples enter
   the provider input; compact criteria and bounded context are sufficient.
5. Primary output passes the shared validators. Optional one malformed/schema retry uses the same profile.
   If escalation is indicated, the configured strong evaluator independently receives the same original input.
   Primary state is never applied first. No transport/auth/rate failure silently changes provider.
6. A valid final result is applied once. A still-uncertain intent or unresolved unknown-approach/ambiguous-evidence
   escalation becomes `unreliable_evaluation`; no progress is guessed. Explicit supported contradictions may
   downgrade state. The final DB transaction checks claim token, lease and base revision, then stores state,
   server progress, core-complete flag, public feedback and final evaluation together.
7. Failure stores a fixed unavailable/clarification notice while preserving previous reasoning/progress. Retry
   reuses the message, replaces its earlier failure notice and obtains a fresh claim. Only the latest failed
   evaluation with an unchanged base revision can retry. Success cannot be re-evaluated. Retry has its own UUID.

Lease duration covers configured primary+strong timeouts and all allowed structured retries plus 60 seconds.
With current profiles/retry 0 this is 240 seconds. Expired work is reported as retryable failure; next gated
operation marks stale observations failed. A late worker's token cannot commit. The UI polls saved status
while running and keeps the text box available for preparing the next response. Send/Hint/Finish wait for the
active evaluation; once the lease expires, Retry/Hint/Finish are available again.

There is no queue/job/Redis. A process crash after a remote API accepted a request can leave usage unknown.
A later explicit retry may incur another remote charge; without provider-side idempotency, exactly-once
billing across that crash cannot be promised. DB finalization is still at most once; reserved/unknown runs
remain visible and counted against request budgets. Configuration changes do not retroactively reinterpret
old run logs or old published versions.

## 12. Controlled responses, hints and review

| Final intent | Live response / state behavior |
| --- | --- |
| reasoning | Fixed feedbackCategory template; final validated assessments update state |
| clarification | Repeats authored public assumptions, or points to their panel if long; unspecified conditions stay unspecified |
| meta_interview | Repeats the public question, permits thinking aloud, or offers continued thinking / Hint button |
| hint_request | Directs to Hint button; no generated/released hint |
| direct_answer_request | Declines in-interview answer release and points to Hint button; no strike |
| off_topic | Fixed request to stay on this problem; strike, no state change |
| prompt_injection | Fixed restricted-evaluator response; strike, no hidden content or state change |
| uncertain | Bounded escalation; if still uncertain, clarification request with unchanged state |

Templates never interpolate node labels, misconception descriptions, model explanation or unrevealed hints.
Clarification conservatively lists public assumptions rather than asking a model to invent a condition.
No raw model tokens are streamed. No user-facing response exposes profile/model/cost/API errors.

Hint clicks use the gated owner-only context, pure selector and revision-checked commit. Only an unused,
eligible reviewed hint from the pinned version is stored/released. Confirmed nodes are excluded, unresolved
prerequisites and blockers prioritized, and lower levels preferred. Hints make no LLM call and do not alter
progress. Exhausted prerequisite hints can leave no eligible hint: the user must explain that prerequisite
or finish; downstream answer fragments are not automatically revealed. Hint selection may still work when
message quota/cooldown blocks evaluation. Already released hint text has explicit provenance in future input;
this is not a guarantee of independent understanding or a comprehensive mastery model.

Core-complete is a UI notice, not automatic Finish. Finished-owner debrief uses the frozen problem version,
reference answer, reviewed key ideas/alternatives and deterministic covered/unresolved summaries. It does not
make a generative debrief call or expose assessment traces. In-progress/other-user review is rejected by DB.
Mock/legacy-only interviews do not claim a live personalized assessment.

## 13. Durable abuse, rate and cost controls

These are provisional MVP defaults, centralized in `live/config.ts`, with env overrides:

| Variable | Default / accounting |
| --- | --- |
| MAX_EVALUATION_MESSAGE_CHARS | 4000; storage ceiling 20000 |
| MAX_EVALUATIONS_PER_MINUTE | 12 per user; recent claims, running reservations and requests |
| MAX_ATTEMPT_EVALUATIONS_PER_MINUTE | 6 recent provider requests per attempt, checked before a new message |
| MAX_EVALUATIONS_PER_ATTEMPT | 100 successful evaluations, with in-flight reservations |
| MAX_EVALUATIONS_PER_DAY | 300 successful evaluations per user / UTC day, with in-flight reservations |
| MAX_ESCALATIONS_PER_DAY | 20 reserved escalation requests per user / UTC day, including failures/retries |
| MAX_PROVIDER_REQUESTS_PER_DAY | 1000 reserved calls per user / UTC day, all roles/errors/retries |
| ABUSE_STRIKE_THRESHOLD | 3 consecutive off-topic/injection results |
| ABUSE_COOLDOWN_SECONDS | 60 seconds; expiry allows a fresh attempt at reasoning |
| MAX_EVALUATION_RETRIES | 2 explicit retries of a saved failed message (configurable 0–3) |
| EVALUATOR_STRUCTURED_RETRIES | 0 per role (configurable 0–1); only malformed/schema retry |

Rate checks are conservative: failed calls and extra strong calls count, and in-flight reservations can
reduce remaining capacity. They are DB-backed, not process-local. Successful intent classifications, including
abuse, count as evaluations; platform/validation failures do not consume the successful-evaluation quota.
They still consume actual-request budgets to prevent unlimited failure retries. Minute limits gate new
submissions; an admitted evaluation's bounded escalation/retry can finish, subject to daily request budgets.
Each provider request is reserved under the shared user lock, including cross-attempt activity.

Only off_topic/prompt_injection increment strikes. Other successfully interpreted intents reset consecutive
strikes; ordinary stuck/unsure, clarification, simple answer requests and Hint requests are not abuse. A failed
provider/uncertain result neither penalizes nor fabricates progress. Cooldown and quotas do not block viewing
history or manual Finish. Daily token quotas, multi-account abuse controls and automatic budget alerts are
not implemented; input/output bounds and request budgets provide the current cost controls.

## 14. Logs, Admin QA and verification

`message_evaluations` groups each saved user message and its final result/status/revision/progress.
`assessment_runs` records every primary/escalation/structured retry with profile, actual adapter/model,
policy/schema versions, profile configuration hash, input/output/cached usage, latency, cost availability,
validation issue codes, escalation reasons and sanitized error type. Prompt/authorization headers/API keys
and raw invalid responses are never logged. Validated evidence quotes are private QA data, accessible only
to Admin; they can repeat relevant portions of the already-saved user message, not entire conversations.
Reported token usage is `exact`; calculated dollar cost is always an estimate from registry prices. Missing
usage or pricing remains unavailable; mock runs are explicitly labelled no-provider-request/zero cost.

`/admin/evals` shows the most recent 100 message evaluations, with failed/escalated/abuse/unreviewed filters,
per-call validated results, final assessment, before/after progress, usage/latency/cost and human review.
Allowed decisions: correct, incorrect, partially_incorrect, needs_investigation, plus reviewer notes.
Server action and DB both require Admin. Review metadata can support future benchmark export; this milestone
adds neither automatic export/training nor past-state reprocessing. The dashboard counts actual pending QA.

`pnpm test` uses mock transport + disposable PostgreSQL, including RLS, idempotency, order/lease/retry,
private context, state downgrade, escalation failure, quota, hints/review and human-review invariants.
No paid calls or hosted data writes occur. `pnpm eval:dry`/`eval:live` preserve the existing offline benchmark.

```bash
pnpm eval:smoke --plan
pnpm eval:smoke --live
```

The separate explicit live smoke exercises four synthetic messages through the actual runtime and disposable
PostgreSQL (at most eight paid calls, concurrency 1, no structured retry), then finishes/reviews the synthetic
attempt. It makes no hosted Supabase writes and does not verify cookie Auth, real browser rendering or hosted
migration application. Summary artifacts omit prompts/private text and are gitignored. See STATUS for actual
executed results and [M4B_VERIFICATION](M4B_VERIFICATION.md) for the remaining browser/hosted checks.

M4-B stops at live evaluator integration. Discovery/crawlers, authoring LLM, automatic publishing, RAG,
fine-tuning, payment, production deployment changes and Korean localization remain out of scope.
## Admin Test workspace (M4-B follow-up)

After applying `20261007000200_admin_test_workspace.sql`, open **07 Test** at `/admin/test`.
Choose a published problem, Start test, then send reasoning through the same live/mock engine as practice.
The server-selected profiles, validation, escalation, controlled feedback, hints and account limits are unchanged.
Send/Retry in live mode can incur provider costs; Start/Reset and problem selection do not call a model.

Reset creates a new empty attempt and preserves the previous conversation and QA records. It is available
while an evaluation is running; the old claim is invalidated and its late result cannot change the new state.
An already-issued remote request may still incur a charge, with unavailable usage/cost recorded if its
observation is canceled. Reset does not clear daily/account request budgets.

**06 Evaluations** marks these records **Admin Test** and offers a Conversation source filter.
The tag comes from the attempt origin in the database, not from model output or the sender's account role.
An admin using the regular practice page is still **User Practice**. Only published versions are testable;
testing does not lock an editable draft or change the authoring workflow. Existing attempts retain their
version, and a reset selects the latest published version. See [manual checks](M4B_VERIFICATION.md#7-admin-test-follow-up).
