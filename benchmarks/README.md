# Evaluator example review

`reasoning-v2` contains 83 **AI-authored proposals awaiting human review**: 59 calibration and 24 holdout.
This is a development dataset, not a certified measure of production accuracy. The default CLI only selects
calibration. All examples remain outside application/client imports; no published problem/DB data was changed.

## Review a concrete draft

Run `pnpm eval:review` and open `artifacts/evals/review/calibration-boundary.md` (19 boundary cases).
Each entry includes the input, prior context when needed, all node labels, misconception IDs and a rationale.
The shared policy and problem criteria are included. Use `--priority all` for all 59 calibration cases.
This command is entirely offline and does not load environment secrets.

Prioritize these questions:

1. Does `hedged-answer` express a reconstruction guarantee, or only an unsupported proposal? The existing
   Drone detectionNotes require the former; the compact builder now preserves that requirement.
2. Does `drone-hedged-justified` justify the objective despite saying "Maybe"? Judge the argument, not tone.
3. Should `wrong-reason-right-name` receive positive credit on a node whose justification asserts the active
   misconception? Policy v2 proposes no positive credit on that node; valid separate nodes retain credit.
4. Are the Camera/Representation legacy aggregate-metric examples misconceptions under their actual criteria?
   v2 proposes corrected labels, but the original seed/DB labels remain untouched. Inspect whether the broadly
   authored misconception and its related node are appropriate, especially Camera's paired-item node.
5. Are `short-answer` and `drone-partial-objective` meaningfully different? The proposal grants partial only
   to an identifiable valid component of the criterion, not a technique name alone.
6. In `valid-alternative` and `reason-signal`, which additional nodes actually have support? All nodes are now
   labelled; broad criteria such as "variation in dynamics" require careful interpretation in their node context.
7. Does `later-contradiction` conflict with previous reasoning without fitting a supplied misconception ID?
   Preserve the conflict and escalate rather than inventing a catalog entry.

Record approval/disagreement plus the technical reason in the review copy. A reviewer need not write examples
from scratch. Correct the canonical fixture annotations only after considering the criterion independently of
provider outputs; do not relabel simply because both tested efforts agree. Checkbox notes in an export do not
automatically change source labels or their review status. All committed annotations currently remain unreviewed.
Changes to a published problem's actual rubric require the existing M3 new-version workflow, not a seed rewrite.

## Calibration and holdout

- `pnpm eval:dry --all-cases`: 59 calibration cases, 56 scripted evaluations and three pre-guards.
- `pnpm eval:dry --split all --all-cases`: offline contract checks for all 83 proposed cases.
- `pnpm eval:live --profile eval-luna-medium --limit 10 --plan`: prepare a ten-request live smoke without calls.
- `pnpm eval:live --profile eval-luna-medium --split calibration --all-cases`: explicit paid calibration run.
- `pnpm eval:live --profile eval-luna-medium --split holdout --all-cases --plan`: plan the reserved 24-case evaluation.
  Remove `--plan` only when deliberately choosing to pay for the run. Add the xhigh profile to compare both.

Never put fixture labels/rationales into live prompts. The split groups related case families; exact duplicates
and families crossing splits are checked locally. It cannot guarantee semantic independence. The same AI authored
both sets. Keep holdout outcomes away from prompt tuning; if used for tuning, reserve a new set. Add real, permitted
user examples and independent domain review as evidence becomes available. Neither more synthetic cases nor a
second model's agreement substitutes for that evidence.

## Changes from the original baseline

- `global.ts` and the three M3 seed examples retain the original 47 messages/labels through `--dataset legacy`.
  It runs the current policy/input builder; old artifacts remain the record of the old engine.
- `curated.ts` adds explicit rationales/review metadata and full node coverage. The repeated Drone reconstruction
  response is included once; its seed case is referenced through `supersedes`.
- Camera/Representation aggregate-metric corrections are proposals with a documented criterion-based reason.
- Bare `Prediction.` now proposes uncertain; a relevant target with incomplete conditioning is a separate partial
  example. The constant-latent suggestion similarly receives no automatic positive learning-signal credit.
- Previously unlabelled nodes now have expected values. Reports also expose label coverage, unscored confirmations,
  per-status accuracy, per-split metrics and safe validation failure codes.

Raw aggregate percentages from old and new sets are not directly comparable. A 100% dry-run score only means
the scripted outputs satisfy the engine and scoring contract; it is not a live accuracy result.

The workflow follows [OpenAI's evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
on task-specific synthetic examples, typical/edge/adversarial coverage and calibration against human judgment.
