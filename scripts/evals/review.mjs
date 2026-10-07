import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadStaticCases, selectSplit, validateDataset } from './datasets.mjs';
import { gradingPolicy, gradingPolicyVersion } from '../../src/lib/evaluator/grading-policy.ts';

const block = text => {
  const fence='`'.repeat(Math.max(3,...[...String(text).matchAll(/`+/g)].map(m=>m[0].length+1)));
  return `${fence}\n${text}\n${fence}`;
};

/** Static AI-authored fixtures only. Never loads credentials, provider outputs or real user messages. */
export function reviewMarkdown(cases, split, priority) {
  const problems=[...new Map(cases.map(c=>[c.problem.problemVersionId,c.problem])).values()];
  return [
    '# Evaluator annotation review', '',
    `Policy: ${gradingPolicyVersion}. Split: ${split}. Priority: ${priority}. Cases: ${cases.length}.`, '',
    '**All labels are AI-authored proposals awaiting human review. No model accuracy is established by this file.**',
    'Review the technical claim and explanation independently of model predictions. Correct labels only with a criterion-based rationale. Keep the original benchmark artifacts.',
    'Calibration cases may guide prompt changes. Holdout families are reserved; if their outcomes guide changes, retire that holdout and prepare a new one. This synthetic split is not an independent expert dataset.', '',
    '## Shared status policy', '', block(gradingPolicy.trim()), '',
    '## Problem criteria used for review', '',
    ...problems.flatMap(p=>[
      `### ${p.problemVersionId}`, '', block(p.question),
      'Assumptions:', '', ...p.assumptions.map(a=>`- ${a}`), '',
      ...p.rubric.map(n=>`- **${n.id}** (${n.label}): ${n.criterion}`), '',
      ...p.misconceptions.map(m=>`- **${m.id}** (${m.label??'Misconception'}): ${m.criterion}${m.detectionCriteria?` Detection rule: ${m.detectionCriteria}`:''}`), '',
    ]),
    '## Proposed labels', '',
    ...cases.flatMap(c=>[
      `### ${c.id}`, '',
      `Problem: ${c.problem.problemVersionId}. Family: ${c.annotation.family}. Review: ${c.annotation.reviewStatus}. Priority: ${c.annotation.reviewPriority}.`, '',
      ...(c.recentContext?.length?['Earlier user context:',block(c.recentContext.map(m=>m.content).join('\n')), 'Prior node states:',block(JSON.stringify(Object.fromEntries(Object.entries(c.initialState.nodes).map(([id,n])=>[id,n.status])),null,2))]:[]),
      'Current response:',block(c.message.content), '',
      'Expected labels (current-turn assessments, not a replacement of the entire accumulated state):',block(JSON.stringify(c.expected,null,2)), '',
      `Rationale: ${c.annotation.rationale}`, '',
      ...Object.entries(c.annotation.rubricRationale).map(([id,reason])=>`- **${id}**: ${reason}`), '',
      ...(c.annotation.supersedes?[`Replaces duplicated/disputed legacy labels: ${c.annotation.supersedes.join(', ')}. Original seed/DB values remain unchanged.`, '']:[]),
      '- [ ] Technical reasoning and criterion checked',
      '- [ ] Tentative / asserted / quoted / corrected claims distinguished',
      '- [ ] All node labels and misconception IDs checked',
      '- Reviewer decision and rationale: _pending_', '',
    ]),
  ].join('\n');
}

export async function main(args=process.argv.slice(2)) {
  let split='calibration',priority='boundary';
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--split')split=args[++i];
    else if(args[i]==='--priority')priority=args[++i];
    else if(args[i]==='--help'){console.log('pnpm eval:review [--split calibration|holdout|all] [--priority boundary|all]\nStatic fixture review export only; no API/DB access. Default: calibration boundary cases.');return;}
    else throw new Error('Unknown review option. Use --help.');
  }
  if(!['calibration','holdout','all'].includes(split)||!['boundary','all'].includes(priority))throw new Error('Invalid review split or priority.');
  const cases=selectSplit(validateDataset(await loadStaticCases()),split).filter(c=>priority==='all'||c.annotation.reviewPriority==='boundary');
  const directory=fileURLToPath(new URL('../../artifacts/evals/review/',import.meta.url));
  await mkdir(directory,{recursive:true,mode:0o700});
  const filename=path.join(directory,`${split}-${priority}.md`);
  await writeFile(filename,reviewMarkdown(cases,split,priority),{mode:0o600});
  console.log(`Exported ${cases.length} proposed cases for human review: ${filename}\nNo provider or database requests were made.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
