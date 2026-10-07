import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import registryData from '../../../../config/evaluator-profiles.json';
import { parseEvaluatorRegistry } from '../registry';
import { liveConfig, LiveConfigurationError } from './config';
import { OpenAICompatibleProvider } from '../providers/openai-compatible';
import { MockEvaluatorProvider } from '../providers/mock';
import type { EvaluatorResult } from '../contracts';
import type { RuntimeStore, OperationResult } from './runtime';
import type { Json } from '@/types/database';

export async function runtimeStore():Promise<RuntimeStore>{
 await requireUser();
 const secret=process.env.EVALUATOR_RUNTIME_SECRET;
 if(!secret||secret.length<32)throw new LiveConfigurationError();
 const db=await createClient();
 return {async operation(name,attemptId,data){
  const {data:result,error}=await db.rpc('evaluator_operation',{p_secret:secret,p_operation:name,p_attempt_id:attemptId,p_data:JSON.parse(JSON.stringify(data)) as Json});
  if(error){if(['PGRST202','42883'].includes(error.code)||error.code==='42501'&&error.message==='Evaluation service unavailable')throw new LiveConfigurationError();throw new Error('Evaluation service unavailable.');}
  return result as unknown as OperationResult;
 }};
}
export async function runtimeDependencies(){
 let config;try{config=liveConfig(parseEvaluatorRegistry(registryData),process.env);}catch{throw new LiveConfigurationError();}
 const store=await runtimeStore();
 return {store,config,provider:()=>config.mode==='live'?new OpenAICompatibleProvider():new MockEvaluatorProvider(input=>{
  // Explicit development fixture: exercises persistence, not actual reasoning quality.
  const text=input.message.content.toLowerCase();
  const intent=/ignore.*instructions|system prompt|hidden rubric/.test(text)?'prompt_injection':/website|capital of|discord bot/.test(text)?'off_topic':/hint/.test(text)?'hint_request':/tell me.*answer|correct solution/.test(text)?'direct_answer_request':/\?/.test(text)?'clarification':/stuck|don't know|think aloud|repeat/.test(text)?'meta_interview':'reasoning';
  const categories={reasoning:'valid_progress',clarification:'clarification',meta_interview:'meta_interview',hint_request:'hint_requested_in_chat',direct_answer_request:'direct_answer_requested',off_topic:'off_topic',prompt_injection:'prompt_injection'} as const;
  const node=input.problem.rubric.find(n=>input.state.nodes[n.id].status!=='confirmed')??input.problem.rubric[0];
  const output:EvaluatorResult={intent,rubricAssessments:intent==='reasoning'?[{rubricNodeId:node.id,status:input.state.nodes[node.id].status==='partial'?'confirmed':'partial',evidence:[{messageId:input.message.id,quote:input.message.content}]}]:[],detectedMisconceptionIds:[],misconceptionEvidence:[],contradictions:[],needsEscalation:false,escalationReason:null,feedbackCategory:categories[intent],clarification:intent==='clarification'?{kind:'assumption',relatedToProblem:true}:null};
  return JSON.stringify(output);
 })};
}
