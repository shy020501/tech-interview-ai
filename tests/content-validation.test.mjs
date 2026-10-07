import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../supabase/seed-data.json' with {type:'json'};
import { parseContent,parsePackage,publicationIssues,parseSource,parseCandidate,parseSourceLinks,emptyPackage } from '../src/lib/authoring/validation.ts';
const original=seed.problems.find(p=>p.id==='problem-drone-dynamics');
const originalPackage=seed.evaluationPackages.find(p=>p.problemVersionId===original.versionId);
const clone=()=>structuredClone(originalPackage);
test('existing published packages remain valid source material for new versions',()=>{
 for(const p of seed.problems.filter(p=>p.status==='published')) {
  const e=seed.evaluationPackages.find(e=>e.problemVersionId===p.versionId);
  assert.deepEqual(publicationIssues(parseContent(p),parsePackage(e)).errors,[]);
 }
});
test('incomplete drafts save structurally, but publication has explicit blocking requirements',()=>{
 const content=parseContent({...original,scenario:'',question:'',primaryCategoryId:'',categoryIds:[]});
 const pkg=parsePackage(emptyPackage());
 const issues=publicationIssues(content,pkg);
 assert.ok(issues.errors.length>=6);assert.ok(issues.warnings.length===2);
 assert.throws(()=>parseContent({...original,title:''}),/title/);
});
test('graph integrity rejects duplicate IDs, absent prerequisites, self edges, cycles and negative weights',()=>{
 const duplicate=clone();duplicate.reasoningRubric.push(duplicate.reasoningRubric[0]);assert.throws(()=>parsePackage(duplicate),/Duplicate/);
 for(const reference of ['missing',originalPackage.reasoningRubric[0].id]){const p=clone();p.reasoningRubric[0].prerequisiteNodeIds=[reference];assert.throws(()=>parsePackage(p),/missing|cycle/);}
 const cycle=clone();cycle.reasoningRubric[0].prerequisiteNodeIds=[cycle.reasoningRubric[1].id];cycle.reasoningRubric[1].prerequisiteNodeIds=[cycle.reasoningRubric[0].id];assert.throws(()=>parsePackage(cycle),/cycle/);
 const negative=clone();negative.reasoningRubric[0].weight=-1;assert.throws(()=>parsePackage(negative),/weight/);
 const nonfinite=clone();nonfinite.reasoningRubric[0].weight=NaN;assert.throws(()=>parsePackage(nonfinite),/weight/);
});
test('nonlinear rubric paths and alternative completion groups are accepted',()=>{
 const p=clone();p.reasoningRubric.forEach(n=>n.prerequisiteNodeIds=[]);
 p.completionCriteria.alternativeNodeGroups=[[p.reasoningRubric[0].id],[p.reasoningRubric[1].id]];
 assert.equal(parsePackage(p).completionCriteria.alternativeNodeGroups.length,2);
});
test('all private references and structured example labels are checked',()=>{
 for(const mutation of [p=>p.hintLadder[0].targetRubricNodeId='absent',p=>p.misconceptions[0].relatedRubricNodeIds=['absent'],p=>p.acceptableAlternativeApproaches[0].rubricNodeIds=['absent'],p=>p.completionCriteria.requiredNodeIds=['absent'],p=>p.completionCriteria.alternativeNodeGroups=[[]],p=>p.evaluationExamples[0].expectedResult.rubricAssessments[0].status='correct_enough',p=>p.evaluationExamples[0].expectedResult.needsEscalation='yes',p=>p.hintLadder[0].level=0.5]) {const p=clone();mutation(p);assert.throws(()=>parsePackage(p));}
});
test('only structured flow metadata is accepted; public projection drops extra private keys',()=>{
 for(const visualization of [{kind:'javascript',code:'alert(1)'},{kind:'flow',title:'x',caption:'',nodes:'wrong'}])assert.throws(()=>parseContent({...original,visualization}));
 const content=parseContent({...original,referenceAnswer:'hidden',hintLadder:[]});assert.equal('referenceAnswer' in content,false);assert.equal('hintLadder' in content,false);
});
test('sources validate URLs, optional integer scores and explicit usage status',()=>{
 const source={title:'Reference',url:'https://example.com/paper',sourceType:'paper',status:'discovered',relevanceScore:null,suggestedCategoryIds:[],notes:'',provenanceNotes:'',usageStatus:'unknown',usageNotes:''};
 assert.equal(parseSource(source).usageStatus,'unknown');
 for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:password@example.com','not a URL'])assert.throws(()=>parseSource({...source,url}));
 for(const relevanceScore of [-1,101,0.5,'90'])assert.throws(()=>parseSource({...source,relevanceScore}));
});
test('original candidates are valid and conversion/source links cannot be forged through draft inputs',()=>{
 const c={sourceId:null,suggestedTitle:'Idea',suggestedScenario:'',suggestedQuestion:'',suggestedCategoryIds:[],competencyIds:[],difficulty:'intermediate',candidateScore:null,status:'pending_review',notes:''};
 assert.equal(parseCandidate(c).sourceId,null);assert.throws(()=>parseCandidate({...c,status:'converted_to_problem'}));
 assert.throws(()=>parseSourceLinks([{sourceId:'source-a',relationType:'copied_without_review',attributionNote:''}]));
 assert.throws(()=>parseSourceLinks([{sourceId:'source-a',relationType:'reference',attributionNote:''},{sourceId:'source-a',relationType:'reference',attributionNote:''}]));
});
test('classification requires a valid difficulty and discards retired question type input',()=>{
 const candidate={sourceId:null,suggestedTitle:'Idea',suggestedScenario:'',suggestedQuestion:'',suggestedCategoryIds:[],competencyIds:[],candidateScore:null,status:'pending_review',notes:''};
 for(const difficulty of ['beginner','intermediate','advanced']) {
  assert.equal(parseContent({...original,difficulty}).difficulty,difficulty);
  assert.equal(parseCandidate({...candidate,difficulty}).difficulty,difficulty);
 }
 for(const difficulty of [undefined,null,'core','applied','expert']) {
  assert.throws(()=>parseContent({...original,difficulty}),/difficulty/);
  assert.throws(()=>parseCandidate({...candidate,difficulty}),/difficulty/);
 }
 assert.equal('questionType' in parseContent({...original,questionType:'applied'}),false);
 assert.equal('questionType' in parseCandidate({...candidate,difficulty:'beginner',questionType:'fundamental'}),false);
});
