# Manual content workflow — M3

M3 uses the existing Supabase project, email/password sessions and profiles.role authorization.
All product text is English. Authoring is manual; no LLM, discovery job or external source fetch runs.
The normal app uses the publishable key and the signed-in user's session, with no service-role key.

Opening a Source, Candidate, Problem or Category editor automatically scrolls it into view, including the
new-problem creation form. Editing fields does not reset the scroll position. Reduced-motion preferences
use immediate scrolling. Successful saves still close the editor; failed saves retain its contents.

## 1. Register a source

Open `/admin/sources` as an admin and choose **Add source**. Enter a title, HTTP/HTTPS URL,
source type, optional category suggestions/score, notes, provenance and usage notes. **Save source**
persists the record and closes the form on success. A failed save keeps the form and inputs open.
**Cancel** closes it without saving. Select a source title or **Edit** to view/change it; **Reject** changes its status.

`usage_status` records an editorial decision (`unknown`, `reference_only`, `approved_for_reuse`).
A public URL is not evidence of reuse permission. No content is downloaded or copied automatically.
**Run discovery · Coming later** is disabled. Sources are optional inspiration/reference records.

## 2. Create a candidate

Open `/admin/candidates` and choose **Create candidate**. Select a source or **Original idea — no external source**.
Write a suggested title, scenario/question, category, type, competencies and difficulty. Scores are optional
human inputs. **Save candidate** closes the form only after a successful save. Failed saves keep inputs
and the error visible; **Cancel** closes without saving. Edit or reject a candidate; a rejected candidate can return to review.

For a pending candidate, confirm its URL slug and click **Create problem draft**. The source relation,
scenario/question and classification prefill a new version. The conversion locks the candidate and stores
the resulting problem ID; retrying returns that same problem. Converted candidates are read-only provenance
records; follow **Review draft** to continue editing their problem.

## 3. Edit the problem package

`/admin/problems` initially shows the problem table with no draft editor open. Select a title or
**Edit draft / View version** to open the existing two-column editor. **Close editor** returns to the
list and asks before discarding unsaved changes. Creating/converting a draft opens it for editing. **Create problem draft** also
supports a new problem without a candidate. A title and stable lowercase URL slug are required to create it.
The URL slug is fixed for this milestone. Display text can change independently of IDs.

Choose a version in **Version history**. For a draft, edit:

- Public content: title, short description, scenario, question, assumptions and tags.
- Classification: primary/secondary categories, Core/Advanced, competencies and difficulty.
- Visualization: `null` or the existing structured `flow` object. No executable HTML, SVG or JavaScript.
- Evaluation package: reference answer, rubric, alternatives, misconceptions, hints, completion criteria and examples.
- Sources/provenance: optional references with relation type and attribution notes, stored for this version.

Draft status, Save/Validate and Human review/Publish controls sit below Sources/provenance in the left
column, with save/validation feedback nearby. Both columns belong to the same form: saving validates and
saves public content and the evaluation package together. Narrow screens stack the columns.

Each Evaluation package subsection starts expanded. Click its heading, or focus it and press Enter/Space,
to collapse or expand it independently. Collapsing keeps unsaved field contents and does not mark the draft
as changed. Browser form validation reopens a section containing an invalid input before focusing the field.

Rubric/hint/example IDs are generated on add and remain stable through edits/reordering. Remove dependent
references before deleting a rubric node. Prerequisites are a DAG, not a required order of conversation.
Hint level is an integer; order within the same level follows the editor list.

Completion criteria use required node IDs and optional alternative groups. With alternative groups,
required nodes plus any one complete group are sufficient. These criteria are authoring data only in M3.
Evaluation examples store the administrator's expected node statuses, misconceptions and escalation decision;
they do not run a model or claim a personal assessment.

**Save draft** accepts incomplete content. Invalid types, missing references, duplicate IDs, rubric cycles
and negative weights are rejected. **Needs Review** is available as a draft status. The revision number
prevents two editors from silently overwriting a newer saved draft. Reload if a stale-save error appears.
A successful save closes the editor and returns to the problem list with **Draft saved** feedback. Select
**Edit draft** again to continue, preview or validate/publish the saved version. Failed saves keep the editor
and input visible. The new-problem creation form also closes/resets after successful creation, then opens
the new draft for its next editing step.

The editor displays **Saved / Unsaved changes** and warns on browser close/reload. There is no custom
in-app navigation blocker: save before choosing a different problem/version. Invalid JSON must be corrected
before saving. No success is shown until the server has accepted the change.

JSON textareas support **Tab** for two-space indentation and **Shift+Tab** for outdent, including selected
lines. Press **Esc**, then **Tab** or **Shift+Tab**, to move keyboard focus out of the JSON editor. Indentation
does not repair malformed JSON; close quoted strings and correct brackets/commas before saving.

## 4. Preview

**Preview as user** opens `/admin/problems/[id]/preview?version=...` in a new tab. It requires admin
access on the server and uses the same public workspace, visualization and chat presentation as practice.
Only saved public content is rendered; interview actions are disabled. Save before previewing new edits.
Drafts never become visible through `/problems/[slug]` merely because an admin previewed them.

## 5. Validate and publish

Reopen the saved version with **Edit draft**, then choose **Validate saved draft**. Blocking errors include missing scenario/question, primary category,
competency, reference answer, meaningful rubric, completion criteria or reviewed hint. Rubric integrity,
all references and structured data are validated again. Missing alternatives/examples produce warnings.

After reviewing public content and the private package, select **I have reviewed this saved version** and
click **Publish version N**. A server action checks requireAdmin and the saved revision, then a database RPC
rechecks the DB role and all publication requirements while holding the problem/version locks.
The current pointer, version status, publication time and compatibility category mapping change atomically.
Failure leaves the prior published version intact. Direct client table writes cannot publish content.

The published problem appears on the next `/problems` load without updating any fixture. Existing active
interviews continue using their original version. Public category metadata comes from that pinned version.

## 6. Revise or archive

Published versions and their evaluation packages/category/source links are immutable, including versions
that have no attempts. Click **Create new version** to copy the public/private package and classification
into a draft. An existing editable version is reused on repeat clicks. Version numbers increase under a lock.
The current published version remains available until the new draft passes validation and is published.
Past versions stay in history as **Superseded**; they are never removed by this workflow.

**Archive problem** removes it from public discovery/new attempts. Owners retain their saved reviews and
can finish an existing active interview. Archiving does not erase any attempt or version.

## Deleting sources, candidates and problems

**Delete** permanently removes an item, separately from **Reject** or **Archive**. Every delete asks for
confirmation and waits for the server; a refused deletion keeps the record and shows its reason.

- **Source:** deletion is blocked while any candidate or any problem version references it. Remove the
  candidate reference or an editable draft's source link first. Published version links remain immutable;
  keep their source as provenance while those versions exist.
- **Candidate:** deletion keeps an already-created problem and its independent source links.
- **Problem:** deletion removes the whole problem, all its versions, private packages and category/source
  links only when no interview attempt exists, regardless of attempt status. Source/category records remain.
  A linked candidate stays and returns to **Pending Review**, allowing a new draft conversion.
- If any interview exists, use **Archive problem**. Deletion never erases an interview, message or hint event.

Direct deletion of individual published snapshots stays prohibited. Only the validated whole-problem
operation has this cleanup exception. List deletion of another problem keeps the current editor open;
deleting the problem currently being edited returns to the list.

## 7. Categories

`/admin/categories` keeps the tree and adds a management form. Create categories, edit display names and
slugs/descriptions, move parents and set sort order. **Add category** or selecting an existing category opens
the form. **Save category** closes it only on success; errors preserve the form and inputs. **Cancel** closes
without saving. Stable IDs do not change. The DB blocks self-parenting
and descendant cycles; there is no fixed depth. Deletion is blocked when a child, version, problem, source
suggestion or candidate references the category. **Delete unused category** only removes unused leaves.

## 8. User hint and review flow

A signed-in user starts/resumes an attempt pinned to one published version. Feedback and progress remain
scripted and visibly labelled. **Give me a hint** releases the next unused reviewed hint by level/list order.
Only one new hint and previously released conversation/hint history are returned; unrevealed hints and the
full rubric remain private. Request IDs prevent retry duplication. Reload restores all released hints.

**Finish interview** is the user's explicit completion action, not a correctness judgment. For a completed
owned attempt, `/review?attempt=...` releases the version's reference answer, rubric label/description key
ideas and alternative descriptions. It does not release rubric weights/prerequisites/evidence criteria,
misconceptions, unrequested hints, evaluation examples or a fabricated personal score. The authenticated
review RPC rejects incomplete, nonexistent or other users' attempts, including for admins.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then `pnpm check:boundaries`.
`pnpm test` uses Node's test runner and test-only PGlite, with no connection to the hosted database.
It migrates an in-memory PostgreSQL database, preserves an existing M2 attempt, and tests role boundaries,
manual authoring, publication, versioning, hints/review, category integrity and rollback SQL assertions.

For the hosted project, run the entire [content_workflow.sql](../supabase/tests/content_workflow.sql) in the
trusted SQL editor. Do not execute only selected lines. Success returns the M3 check message; the final
ROLLBACK removes all test records. This checks DB roles/claims, not browser password authentication.
The old `supabase/tests/rls.sql` is a historical M2-only contract and is not compatible with M3 editorial grants.

For a browser smoke test, use a clearly named **M3 manual check** source/candidate/problem and a unique
`m3-manual-check-...` slug. Add a meaningful rubric, reference answer, two hints and criteria; save/preview/
validate/publish. Use a normal account to start, request hints individually, reload, finish and open review.
Publish V2 with a changed question while V1 is active in another account, then confirm old/new attempts keep
the correct versions. Check a second user's review is inaccessible, and inspect document/RSC/action responses:
reference material is absent while active, only requested hints appear, and the completed review contains
only the allowed debrief. Archive test problems afterwards; historical attempts remain intentionally intact.

`/admin/evals` stays an explicitly labelled fixture area until M4. M4 will connect a provider-independent
structured evaluator to pinned problem packages and server-owned reasoning state. It is not implemented here.
