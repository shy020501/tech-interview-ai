import type { EvaluatorResult, CompactPackage } from '../contracts.ts';
export const unavailableFeedback="I couldn't evaluate that response just now. Your message was saved, so you can retry.";
export const unreliableFeedback="I couldn't evaluate that response reliably. Please clarify your reasoning, or retry the evaluation.";
const feedback={
 valid_progress:'That part of your reasoning is moving in a relevant direction.',
 insufficient_reasoning:'Please explain the justification for your approach more explicitly.',
 possible_misconception:'One assumption in that reasoning may not be consistent with the scenario. Recheck your reasoning before continuing.',
 contradiction:'This appears to conflict with something you said earlier. Clarify which claim you want to keep.',
 alternative_valid_path:'That is a plausible alternative direction. Continue explaining why your approach would work.',
 uncertain:"I couldn't confidently evaluate that statement. Please make the reasoning more explicit.",
};
/** Only fixed text and already-public question/assumptions may reach chat. */
export function controlledFeedback(result:EvaluatorResult, problem:CompactPackage, message:string):string {
 switch(result.intent){
  case 'reasoning':return feedback[result.feedbackCategory as keyof typeof feedback]??feedback.uncertain;
  case 'off_topic':return 'Please keep the conversation focused on the current interview problem.';
  case 'prompt_injection':return 'I can only evaluate reasoning related to the current interview problem.';
  case 'direct_answer_request':return "I won't reveal the answer during the interview. Use the Hint button if you'd like guidance.";
  case 'hint_request':return "Use the Hint button when you'd like guidance.";
  case 'uncertain':return "I couldn't confidently interpret that as part of your reasoning. Please restate your point more explicitly.";
  case 'clarification':return problem.assumptions.join('\n').length>6000
    ? 'Refer to the working assumptions in the problem panel. If a detail is not specified, state a reasonable assumption and continue.'
    : problem.assumptions.length
    ? `The stated assumptions are:\n${problem.assumptions.map(x=>`• ${x}`).join('\n')}\nIf your question concerns another detail, that detail is not specified. State a reasonable assumption and continue.`
    : 'That detail is not specified. State a reasonable assumption and continue.';
  case 'meta_interview':
   if(/\b(repeat|restate)\b.*\bquestion\b/i.test(message))return problem.question.length<=16000?problem.question:'Refer to the Interview Question in the problem panel. You can reason through it step by step.';
   if(/think (out )?aloud/i.test(message))return 'Of course. You can reason through it step by step.';
   return "You can continue thinking out loud, or use the Hint button if you'd like guidance.";
 }
}
export function guardFeedback(reason:string):string {
 const messages:Record<string,string>={
  empty_message:'Write your reasoning before sending.',message_too_long:'Your response is too long. Please keep your reasoning focused on the current interview problem.',
  duplicate_message:'This response is already saved. Continue with a new point or retry its evaluation.',
  evaluation_busy:'An evaluation is already in progress. Please wait and refresh the conversation.',
  attempt_not_active:'This interview is finished. Start a new interview to continue.',
  rate_limit:'Please wait a moment before sending another response.',abuse_cooldown:'This interview session is temporarily paused because recent messages were unrelated to the problem. Please try again shortly.',
  attempt_quota:'The evaluation limit for this interview has been reached. You can still use hints or finish.',
  daily_quota:'Your daily evaluation limit has been reached. You can still use hints or finish.',
  request_quota:'Evaluation is temporarily unavailable because the daily request limit has been reached. You can still use hints or finish.',
  retry_unavailable:'This response cannot be retried. Continue with a new response or finish your interview.',
  mode_changed:'The evaluation setting changed. Finish this interview and start a new one to continue.',
  hints_unavailable:'No unused hint is currently eligible for your reasoning state.',stale_evaluation:unavailableFeedback,
 };
 return messages[reason]??'Evaluation is temporarily unavailable. Please try again later.';
}
