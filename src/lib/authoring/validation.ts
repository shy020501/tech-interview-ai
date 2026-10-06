import type { EditableContent, EditablePackage, SourceLink } from '../../types/authoring';
import type { SourceInput, CandidateInput } from '../../types/source';
import type { EvaluationResult } from '../../types/evaluation';

export class AuthoringError extends Error {}
const fail = (message: string): never => { throw new AuthoringError(message); };
const obj = (x: unknown, label: string): Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : fail(`${label} must be an object.`);
const str = (x: unknown, label: string, max = 30000): string => typeof x === 'string' && x.length <= max ? x : fail(`${label} must be text within ${max} characters.`);
const list = (x: unknown, label: string, max = 100): unknown[] => Array.isArray(x) && x.length <= max ? x : fail(`${label} must be a list of at most ${max} items.`);
const texts = (x: unknown, label: string): string[] => list(x, label).map(v => str(v, label, 4000));
const num = (x: unknown, label: string, max: number, min = 0): number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : fail(`${label} must be between ${min} and ${max}.`);
const pick = <T extends string>(x: unknown, values: readonly T[], label: string): T => typeof x === 'string' && values.includes(x as T) ? x as T : fail(`Invalid ${label}.`);
const bool = (x: unknown, label: string): boolean => typeof x === 'boolean' ? x : fail(`${label} must be true or false.`);
export const machineId = (x: unknown): string => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(x) ? x : fail('Invalid identifier.');
export const slug = (x: unknown): string => typeof x === 'string' && x.length <= 200 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(x) ? x : fail('Use a lowercase hyphenated slug.');
const competencyIds = ['objective_design','failure_diagnosis','debugging','architecture_choice','experiment_design','tradeoff','system_design'] as const;
const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) fail(`Duplicate ${label}.`); };
const refs = (values: string[], ids: Set<string>, label: string) => { unique(values,label); if (values.some(v=>!ids.has(v))) fail(`${label} refers to a missing ID.`); };
const optional = (x: unknown, label: string) => x === undefined ? undefined : str(x,label,10000);
const score = (x: unknown): number | null => x === null ? null : Number.isInteger(num(x,'Score',100)) ? x as number : fail('Score must be an integer.');
function classification(r: Record<string, unknown>) {
  const competencies = texts(r.competencyIds,'Competencies');
  competencies.forEach(id=>pick(id,competencyIds,'competency'));
  return { questionType: pick(r.questionType,['fundamental','applied'] as const,'question type'), difficulty: pick(r.difficulty,['beginner','intermediate','advanced'] as const,'difficulty'), competencyIds: competencies };
}
export function parseContent(input: unknown): EditableContent {
  const r=obj(input,'Public content'), title=str(r.title,'Title',500);
  if (!title.trim()) fail('A draft title is required.');
  const categoryIds=texts(r.categoryIds,'Categories'); unique(categoryIds,'categories');
  const primaryCategoryId=str(r.primaryCategoryId,'Primary category',200);
  if (primaryCategoryId && !categoryIds.includes(primaryCategoryId)) fail('Primary category must be included in categories.');
  let visualization: EditableContent['visualization']=null;
  if (r.visualization !== null) {
    const v=obj(r.visualization,'Visualization'); pick(v.kind,['flow'] as const,'visualization kind');
    const nodes=list(v.nodes,'Flow nodes',30).map(x=>{ const n=obj(x,'Flow node'); return {id:machineId(n.id),label:str(n.label,'Node label',500),detail:str(n.detail,'Node detail',1000)}; });
    if (!nodes.length) fail('A flow needs at least one node.'); unique(nodes.map(n=>n.id),'flow node IDs');
    visualization={kind:'flow',title:str(v.title,'Visualization title',500),caption:str(v.caption,'Visualization caption',4000),nodes};
  }
  return {title,shortDescription:str(r.shortDescription,'Short description'),scenario:str(r.scenario,'Scenario'),question:str(r.question,'Question'),assumptions:[...new Set(texts(r.assumptions,'Assumptions').map(s=>s.trim()).filter(Boolean))],tags:[...new Set(texts(r.tags,'Tags').map(s=>s.trim()).filter(Boolean))],visualization,categoryIds,primaryCategoryId,...classification(r)};
}
function evaluationResult(input: unknown, nodes: Set<string>, misconceptions: Set<string>): EvaluationResult {
  const r=obj(input,'Expected evaluation');
  const evidence=(x:unknown)=>list(x,'Evidence').map(v=>{const e=obj(v,'Evidence');return {messageId:str(e.messageId,'Evidence message ID',200),...(e.quote===undefined?{}:{quote:str(e.quote,'Evidence quote',4000)})};});
  const assessments=list(r.rubricAssessments,'Rubric assessments').map(x=>{const a=obj(x,'Assessment'), id=machineId(a.rubricNodeId);refs([id],nodes,'Assessment');return {rubricNodeId:id,status:pick(a.status,['unseen','partial','confirmed','misconception','uncertain'] as const,'assessment status'),evidence:evidence(a.evidence),explanation:optional(a.explanation,'Explanation')};});
  unique(assessments.map(a=>a.rubricNodeId),'assessment node IDs');
  return {rubricAssessments:assessments,detectedMisconceptions:list(r.detectedMisconceptions,'Expected misconceptions').map(x=>{const a=obj(x,'Expected misconception'),id=machineId(a.misconceptionId);refs([id],misconceptions,'Expected misconception');return {misconceptionId:id,evidence:evidence(a.evidence)};}),contradictions:list(r.contradictions,'Contradictions').map(x=>{const a=obj(x,'Contradiction'),ids=texts(a.rubricNodeIds,'Contradiction nodes');refs(ids,nodes,'Contradiction');return {rubricNodeIds:ids,evidence:evidence(a.evidence),explanation:str(a.explanation,'Contradiction explanation')};}),needsEscalation:bool(r.needsEscalation,'Expected escalation'),escalationReason:r.escalationReason===null?null:str(r.escalationReason,'Escalation reason'),feedbackCategory:pick(r.feedbackCategory,['acknowledgement','clarification_needed','reasoning_supported','reasoning_conflict'] as const,'feedback category')};
}
export function parsePackage(input: unknown): EditablePackage {
  const p=obj(input,'Evaluation package');
  const nodes=list(p.reasoningRubric,'Rubric').map(x=>{const n=obj(x,'Rubric node');return {id:machineId(n.id),label:str(n.label,'Rubric label',10000),description:str(n.description,'Rubric description',10000),weight:num(n.weight,'Rubric weight',10000),prerequisiteNodeIds:texts(n.prerequisiteNodeIds,'Prerequisites'),sufficientEvidenceDescription:str(n.sufficientEvidenceDescription,'Sufficient evidence',10000),notes:optional(n.notes,'Reviewer notes')};});
  unique(nodes.map(n=>n.id),'rubric node IDs'); const ids=new Set(nodes.map(n=>n.id));
  const byId=new Map(nodes.map(n=>[n.id,n])); const active=new Set<string>(),done=new Set<string>();
  function visit(id:string) { if(active.has(id)) fail('Rubric prerequisites contain a cycle.'); if(done.has(id))return; active.add(id); const n=byId.get(id)!;refs(n.prerequisiteNodeIds,ids,'Prerequisites');n.prerequisiteNodeIds.forEach(visit);active.delete(id);done.add(id); }
  nodes.forEach(n=>visit(n.id));
  const misconceptions=list(p.misconceptions,'Misconceptions').map(x=>{const m=obj(x,'Misconception'),related=texts(m.relatedRubricNodeIds,'Related nodes');refs(related,ids,'Misconception');return {id:machineId(m.id),title:str(m.title,'Misconception title'),description:str(m.description,'Misconception description'),relatedRubricNodeIds:related,detectionNotes:optional(m.detectionNotes,'Detection notes')};});
  unique(misconceptions.map(m=>m.id),'misconception IDs');
  const alternatives=list(p.acceptableAlternativeApproaches,'Alternatives').map(x=>{const a=obj(x,'Alternative'),related=texts(a.rubricNodeIds,'Alternative nodes');refs(related,ids,'Alternative');return {id:machineId(a.id),title:optional(a.title,'Alternative title'),description:str(a.description,'Alternative description'),rubricNodeIds:related};});
  unique(alternatives.map(a=>a.id),'alternative IDs');
  const hints=list(p.hintLadder,'Hints').map(x=>{const h=obj(x,'Hint'),id=machineId(h.targetRubricNodeId),level=num(h.level,'Hint level',999,1);refs([id],ids,'Hint target');if(!Number.isInteger(level))fail('Hint level must be an integer.');return {id:machineId(h.id),targetRubricNodeId:id,level,text:str(h.text,'Hint text',4000)};});
  unique(hints.map(h=>h.id),'hint IDs');
  const c=obj(p.completionCriteria,'Completion criteria'),required=texts(c.requiredNodeIds,'Required nodes');refs(required,ids,'Completion criteria');
  const groups=list(c.alternativeNodeGroups,'Alternative groups').map(x=>{const g=texts(x,'Alternative group');if(!g.length)fail('Alternative completion groups cannot be empty.');refs(g,ids,'Alternative group');return g;});
  const examples=list(p.evaluationExamples,'Evaluation examples').map(x=>{const e=obj(x,'Example');return {id:machineId(e.id),response:str(e.response,'Example user answer'),expectedResult:evaluationResult(e.expectedResult,ids,new Set(misconceptions.map(m=>m.id))),reviewerNotes:optional(e.reviewerNotes,'Example notes')};});
  unique(examples.map(e=>e.id),'example IDs');
  return {referenceAnswer:str(p.referenceAnswer,'Reference answer'),reasoningRubric:nodes,acceptableAlternativeApproaches:alternatives,misconceptions,hintLadder:hints,completionCriteria:{requiredNodeIds:required,alternativeNodeGroups:groups,description:str(c.description,'Completion description')},evaluationExamples:examples};
}
export function publicationIssues(content: EditableContent, evaluation: EditablePackage) {
  const errors:string[]=[],warnings:string[]=[];
  for(const [label,text] of [['Title',content.title],['Scenario',content.scenario],['Question',content.question],['Reference answer',evaluation.referenceAnswer]]) if(!text.trim())errors.push(`${label} is missing.`);
  if(!content.primaryCategoryId)errors.push('A primary category is required.');
  if(!content.competencyIds.length)errors.push('At least one competency is required.');
  const nodes=evaluation.reasoningRubric;
  if(!nodes.length||!nodes.some(n=>n.weight>0))errors.push('A meaningful rubric with positive weight is required.');
  if(nodes.some(n=>!n.label.trim()||!n.description.trim()||!n.sufficientEvidenceDescription.trim()))errors.push('Complete every rubric node, including sufficient evidence.');
  if(!evaluation.hintLadder.length||evaluation.hintLadder.some(h=>!h.text.trim()))errors.push('At least one reviewed hint is required; no hint can be blank.');
  const c=evaluation.completionCriteria;
  if(!c.description.trim()||(!c.requiredNodeIds.length&&!c.alternativeNodeGroups.length))errors.push('Completion criteria are incomplete.');
  if(!evaluation.acceptableAlternativeApproaches.length)warnings.push('No alternative approach has been documented.');
  if(!evaluation.evaluationExamples.length)warnings.push('No evaluation examples have been documented for future benchmarks.');
  return {errors,warnings};
}
export function parseSource(input:unknown):SourceInput {
  const r=obj(input,'Source'),title=str(r.title,'Title',500),url=str(r.url,'URL',2048);
  if(!title.trim())fail('A title is required.');
  try { const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('Use a public HTTP or HTTPS URL without credentials.'); } catch {fail('Enter a valid HTTP or HTTPS URL.');}
  return {title,url,sourceType:pick(r.sourceType,['paper','technical_blog','video','interview_report','educational_material','social_media','other'] as const,'source type'),status:pick(r.status,['discovered','screened','rejected','candidate_created'] as const,'source status'),suggestedCategoryIds:texts(r.suggestedCategoryIds,'Categories'),relevanceScore:score(r.relevanceScore),notes:str(r.notes,'Notes',10000),provenanceNotes:str(r.provenanceNotes,'Provenance notes',10000),usageStatus:pick(r.usageStatus,['unknown','reference_only','approved_for_reuse'] as const,'usage status'),usageNotes:str(r.usageNotes,'Usage notes',10000)};
}
export function parseCandidate(input:unknown):CandidateInput {
  const r=obj(input,'Candidate'),title=str(r.suggestedTitle,'Title',500);
  if(!title.trim())fail('A title is required.');
  return {sourceId:r.sourceId===null?null:machineId(r.sourceId),suggestedTitle:title,suggestedScenario:str(r.suggestedScenario,'Scenario'),suggestedQuestion:str(r.suggestedQuestion,'Question'),suggestedCategoryIds:texts(r.suggestedCategoryIds,'Categories'),...classification(r),candidateScore:score(r.candidateScore),status:pick(r.status,['pending_review','rejected'] as const,'candidate status'),notes:str(r.notes,'Notes',10000)};
}
export function parseSourceLinks(input:unknown):SourceLink[] {
 const links=list(input,'Source links',50).map(x=>{const r=obj(x,'Source link');return {sourceId:machineId(r.sourceId),relationType:pick(r.relationType,['inspired_by','adapted_from','reference','validation_source'] as const,'source relation'),attributionNote:str(r.attributionNote,'Attribution note',10000)};});unique(links.map(l=>l.sourceId),'source links');return links;
}
export function emptyPackage():EditablePackage {return {referenceAnswer:'',reasoningRubric:[],acceptableAlternativeApproaches:[],misconceptions:[],hintLadder:[],completionCriteria:{requiredNodeIds:[],alternativeNodeGroups:[],description:''},evaluationExamples:[]};}
