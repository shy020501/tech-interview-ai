'use server';
import { requireAdmin } from '@/lib/auth/session';
import { validUuid } from '@/lib/auth/validation';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { MutationResult } from '@/types/authoring';
export async function reviewEvaluation(id:unknown,review:unknown,notes:unknown):Promise<MutationResult>{
 await requireAdmin();
 if(!validUuid(id)||typeof review!=='string'||!['correct','incorrect','partially_incorrect','needs_investigation'].includes(review)||typeof notes!=='string'||notes.length>4000)return {ok:false,error:'Choose a review decision and keep notes within 4,000 characters.'};
 const db=await createClient();const {error}=await db.rpc('admin_review_evaluation',{p_id:id,p_review:review,p_notes:notes});
 if(error)return {ok:false,error:'Unable to save the review.'};
 revalidatePath('/admin/evals');return {ok:true,message:'Human review saved. Interview state was not changed.'};
}
