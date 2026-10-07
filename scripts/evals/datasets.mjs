import { readFile } from 'node:fs/promises';
import { buildCompactPackage } from '../../src/lib/evaluator/input.ts';
import { casesFromM3Examples } from '../../src/lib/evaluator/benchmark/legacy.ts';
import { parsePackage } from '../../src/lib/authoring/validation.ts';
import { globalCases } from '../../benchmarks/fixtures/global.ts';
import { curatedCases } from '../../benchmarks/fixtures/curated.ts';

export function packageCases(problem, data) {
  const full={...parsePackage(data),problemVersionId:problem.versionId};
  return casesFromM3Examples(buildCompactPackage(problem,full),full.evaluationExamples);
}
export async function loadLegacyCases(maxMessageChars=4000) {
  const seed=JSON.parse(await readFile(new URL('../../supabase/seed-data.json',import.meta.url),'utf8'));
  const drone=seed.problems.find(p=>p.versionId==='pv-drone-1');
  const full=seed.evaluationPackages.find(p=>p.problemVersionId===drone.versionId);
  const global=globalCases(buildCompactPackage(drone,full),maxMessageChars);
  const examples=seed.evaluationPackages.flatMap(p=>packageCases(seed.problems.find(problem=>problem.versionId===p.problemVersionId),p));
  return [...global,...examples];
}

export async function loadStaticCases(maxMessageChars=4000) {
  const seed=JSON.parse(await readFile(new URL('../../supabase/seed-data.json',import.meta.url),'utf8'));
  const compact = id => {
    const problem=seed.problems.find(p=>p.versionId===id);
    const full=seed.evaluationPackages.find(p=>p.problemVersionId===id);
    return buildCompactPackage(problem,full);
  };
  return curatedCases(compact('pv-drone-1'),compact('pv-camera-1'),compact('pv-representation-1'),maxMessageChars);
}

// Split before --limit. DB labels are kept verbatim, with no invented expert-review claim.
export function selectSplit(cases, split='calibration') {
  if(!['calibration','holdout','all'].includes(split))throw new Error('Invalid benchmark split.');
  return cases.filter(c=>!c.annotation||split==='all'||c.annotation.split===split);
}

export function validateDataset(cases) {
  const ids=new Set(),inputs=new Set(),families=new Map();
  for(const c of cases) {
    if(ids.has(c.id))throw new Error('Duplicate dataset case IDs.');
    ids.add(c.id);
    if(!c.annotation)continue; // Historical/DB sets may deliberately retain legacy duplicates.
    const a=c.annotation;
    if(!a.rationale?.trim()||!['calibration','holdout'].includes(a.split)||a.reviewStatus!=='needs_human_review')throw new Error('Invalid proposed benchmark annotation.');
    const key=JSON.stringify([c.problem.problemVersionId,c.message.content.trim().replace(/\s+/g,' '),c.recentContext??[],c.initialState??null]);
    if(inputs.has(key))throw new Error('Duplicate proposed benchmark input.');
    inputs.add(key);
    if(families.has(a.family)&&families.get(a.family)!==a.split)throw new Error('Benchmark family crosses calibration and holdout.');
    families.set(a.family,a.split);
    const nodes=new Set(c.problem.rubric.map(n=>n.id));
    if(Object.keys(c.expected.rubricStatuses).some(id=>!nodes.has(id)))throw new Error('Invalid expected benchmark rubric ID.');
    if(c.expected.intent==='reasoning'&&!c.expected.guardReason&&Object.keys(c.expected.rubricStatuses).length!==nodes.size)throw new Error('Missing proposed benchmark node labels.');
    if(Object.keys(c.expected.rubricStatuses).some(id=>!a.rubricRationale[id]?.trim()))throw new Error('Missing benchmark label rationale.');
    if(c.expected.misconceptionIds?.some(id=>!c.problem.misconceptions.some(m=>m.id===id)))throw new Error('Invalid expected benchmark misconception ID.');
  }
  return cases;
}

/** Read-only existing-user session + profiles/RLS. Never accepts a service-role credential. */
export async function loadSupabaseCases(client, versionIds) {
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError||!auth?.user)throw new Error('Benchmark dataset requires a verified admin session.');
  const {data:profile,error:profileError}=await client.from('profiles').select('user_id, role').eq('user_id',auth.user.id).single();
  if(profileError||profile?.role!=='admin'||profile.user_id!==auth.user.id)throw new Error('Benchmark dataset requires the database admin role.');
  if(!versionIds.length||versionIds.length>20||versionIds.some(id=>!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(id)))throw new Error('Choose 1–20 valid problem version IDs.');
  const cases=[];
  for(const id of [...new Set(versionIds)]) {
    const version=await client.from('problem_versions').select('id, problem_id, scenario, question, assumptions').eq('id',id).single();
    const pkg=await client.from('problem_evaluation_packages').select('problem_version_id, reasoning_rubric, acceptable_alternative_approaches, misconceptions, completion_criteria, evaluation_examples').eq('problem_version_id',id).single();
    if(version.error||pkg.error||!version.data||!pkg.data)throw new Error('Unable to read the requested version/package.');
    const v=version.data,p=pkg.data;
    if(v.id!==id||p.problem_version_id!==id||typeof v.scenario!=='string'||typeof v.question!=='string'||!Array.isArray(v.assumptions)||v.assumptions.some(a=>typeof a!=='string'))throw new Error('Invalid benchmark dataset.');
    cases.push(...packageCases({id:v.problem_id,versionId:id,scenario:v.scenario,question:v.question,assumptions:v.assumptions},{referenceAnswer:'',reasoningRubric:p.reasoning_rubric,acceptableAlternativeApproaches:p.acceptable_alternative_approaches,misconceptions:p.misconceptions,hintLadder:[],completionCriteria:p.completion_criteria,evaluationExamples:p.evaluation_examples}));
  }
  if(!cases.length)throw new Error('These versions contain no evaluation examples. Add reviewed examples in the M3 editor.');
  return cases;
}
