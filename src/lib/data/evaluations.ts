import 'server-only';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
export async function getPendingEvaluationCount(){
 await requireAdmin();const db=await createClient();
 const {count,error}=await db.from('message_evaluations').select('id',{count:'exact',head:true}).in('human_review',['not_reviewed','needs_investigation']);
 if(error)throw new Error('Unable to load evaluation history. Apply the M4-B migration if setup is incomplete.');
 return count??0;
}
export async function getEvaluationQA(){
 await requireAdmin();const db=await createClient();
 const {data:entries,error}=await db.from('message_evaluations').select('id,attempt_id,user_id,problem_version_id,message_id,status,mode,final_intent,final_result,progress_before,progress_after,state_revision,human_review,reviewer_notes,error_type,created_at,completed_at,final_assessment_run_id').order('created_at',{ascending:false}).limit(100);
 if(error)throw new Error('Unable to load evaluation history. Apply the M4-B migration if setup is incomplete.');
 if(!entries.length)return [];
 const [runs,messages,versions]=await Promise.all([
  db.from('assessment_runs').select('id,evaluation_id,attempt_id,role,mode,evaluator_profile,provider,model,policy_version,schema_version,profile_version,intent,validated_result,status,schema_valid,semantic_valid,issue_codes,escalation_reason,input_tokens,output_tokens,cached_tokens,usage_status,latency_ms,estimated_cost,cost_status,error_type,created_at').in('evaluation_id',entries.map(e=>e.id)).order('created_at'),
  db.from('attempt_messages').select('id,content').in('id',entries.map(e=>e.message_id)),
  db.from('problem_versions').select('id,title,version_number').in('id',[...new Set(entries.map(e=>e.problem_version_id))]),
 ]);
 if(runs.error||messages.error||versions.error)throw new Error('Unable to load assessment details.');
 return entries.map(e=>({...e,title:versions.data.find(v=>v.id===e.problem_version_id)?.title??'Interview',version:versions.data.find(v=>v.id===e.problem_version_id)?.version_number,
  message:messages.data.find(m=>m.id===e.message_id)?.content??'Message unavailable',runs:runs.data.filter(r=>r.evaluation_id===e.id)}));
}
