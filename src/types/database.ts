// Hand-maintained data projections for the tracked M2–M4-B migrations.
import type { ProblemPublic } from './problem';
import type { ProblemEvaluationPackage } from './evaluation';
import type { AttemptOrigin, ChatMessage } from './attempt';
import type { VersionStatus, SourceRelation } from './authoring';
import type { SourceType, UsageStatus } from './source';
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type ProfileRow = { user_id: string; role: 'user' | 'admin'; created_at: string; updated_at: string };
export type CategoryRow = { id: string; slug: string; name: string; parent_id: string | null; description: string | null; sort_order: number; created_at: string; updated_at: string };
export type ProblemRow = { id: string; slug: string; status: ProblemPublic['status']; current_version_id: string | null; published_at: string | null; created_at: string; updated_at: string };
export type VersionRow = { id: string; problem_id: string; version_number: number; title: string; short_description: string; scenario: string; question: string; assumptions: string[]; visualization: ProblemPublic['visualization']; competency_ids: string[]; difficulty: ProblemPublic['difficulty']; tags: string[]; origin: 'original_mock' | 'manual'; status: VersionStatus; revision: number; published_at: string | null; published_by: string | null; created_by: string | null; updated_at: string; created_at: string };
export type ProblemCategoryRow = { problem_id: string; category_id: string; is_primary: boolean };
export type PackageRow = { id: string; problem_version_id: string; reference_answer: string; reasoning_rubric: ProblemEvaluationPackage['reasoningRubric']; acceptable_alternative_approaches: ProblemEvaluationPackage['acceptableAlternativeApproaches']; misconceptions: ProblemEvaluationPackage['misconceptions']; hint_ladder: ProblemEvaluationPackage['hintLadder']; completion_criteria: ProblemEvaluationPackage['completionCriteria']; evaluation_examples: ProblemEvaluationPackage['evaluationExamples']; created_at: string; updated_at: string };
export type AttemptRow = { id: string; user_id: string; problem_id: string; problem_version_id: string; origin: AttemptOrigin; test_request_id: string | null; status: 'in_progress' | 'completed' | 'abandoned'; reasoning_state: Json; progress: number; core_complete: boolean; evaluation_mode: 'live'|'mock'|null; started_at: string; completed_at: string | null; updated_at: string };
export type MessageRow = { id: string; attempt_id: string; sequence_number: number; role: ChatMessage['role']; content: string; request_id: string | null; created_at: string };
export type HintEventRow = { id: string; attempt_id: string; hint_id: string; hint_level: number; displayed_text: string; created_at: string };
export type VersionCategoryRow = { problem_version_id: string; category_id: string; is_primary: boolean };
export type SourceRow = { id: string; title: string; url: string; source_type: SourceType; status: 'discovered' | 'screened' | 'rejected' | 'candidate_created'; discovered_at: string; relevance_score: number | null; suggested_category_ids: string[]; notes: string; provenance_notes: string; usage_status: UsageStatus; usage_notes: string; created_at: string; updated_at: string; created_by: string | null };
export type CandidateRow = { id: string; source_id: string | null; suggested_title: string; suggested_scenario: string; suggested_question: string; suggested_category_ids: string[]; competency_ids: string[]; difficulty: ProblemPublic['difficulty']; candidate_score: number | null; status: 'pending_review' | 'rejected' | 'converted_to_problem'; notes: string; converted_problem_id: string | null; created_at: string; updated_at: string; created_by: string | null };
export type ProblemSourceRow = { problem_version_id: string; source_id: string; relation_type: SourceRelation; attribution_note: string };
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
export type Database = {
  public: {
    Tables: {
      message_evaluations: Table<MessageEvaluationRow>; assessment_runs: Table<AssessmentRunRow>;
      profiles: Table<ProfileRow>; categories: Table<CategoryRow>; problems: Table<ProblemRow>;
      problem_versions: Table<VersionRow>; problem_categories: Table<ProblemCategoryRow>;
      problem_evaluation_packages: Table<PackageRow>; attempts: Table<AttemptRow>;
      attempt_messages: Table<MessageRow>; hint_events: Table<HintEventRow>;
      sources: Table<SourceRow>; question_candidates: Table<CandidateRow>; problem_sources: Table<ProblemSourceRow>; problem_version_categories: Table<VersionCategoryRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      admin_start_test: { Args: { p_problem_id: string; p_request_id: string; p_reset_attempt_id: string | null }; Returns: string };
      evaluator_operation: { Args: { p_secret:string; p_operation:string; p_attempt_id:string; p_data:Json }; Returns: Json };
      get_evaluation_status: { Args:{p_attempt_id:string}; Returns:Json };
      admin_review_evaluation: { Args:{p_id:string;p_review:string;p_notes:string}; Returns:undefined };
      admin_delete_source: { Args: { p_id: string }; Returns: undefined };
      admin_delete_candidate: { Args: { p_id: string }; Returns: undefined };
      admin_delete_problem: { Args: { p_problem_id: string }; Returns: undefined };
      admin_save_source: { Args: { p_id: string | null; p_data: Json }; Returns: string };
      admin_save_candidate: { Args: { p_id: string | null; p_data: Json }; Returns: string };
      admin_save_category: { Args: { p_id: string | null; p_data: Json }; Returns: string };
      admin_delete_category: { Args: { p_id: string }; Returns: undefined };
      admin_create_problem: { Args: { p_slug: string; p_title: string }; Returns: string };
      admin_convert_candidate: { Args: { p_id: string; p_slug: string }; Returns: string };
      admin_save_problem_version: { Args: { p_version_id: string; p_revision: number; p_content: Json; p_package: Json; p_sources: Json; p_status: string }; Returns: number };
      admin_create_version: { Args: { p_problem_id: string }; Returns: string };
      admin_publish_version: { Args: { p_version_id: string; p_revision: number }; Returns: string };
      admin_archive_problem: { Args: { p_problem_id: string }; Returns: undefined };
      get_attempt_debrief: { Args: { p_attempt_id: string }; Returns: Json };
      start_interview: { Args: { p_problem_id: string }; Returns: string };
      append_interview_turn: { Args: { p_attempt_id: string; p_content: string; p_request_id: string }; Returns: string };
      request_interview_hint: { Args: { p_attempt_id: string; p_request_id: string }; Returns: string };
      finish_interview: { Args: { p_attempt_id: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type MessageEvaluationRow = {origin:AttemptOrigin;id:string;attempt_id:string;user_id:string;problem_version_id:string;message_id:string;status:'running'|'succeeded'|'failed';mode:'mock'|'live';final_intent:string|null;final_result:Json;progress_before:number;progress_after:number;state_revision:number;human_review:string;reviewer_notes:string;error_type:string|null;created_at:string;completed_at:string|null;final_assessment_run_id:string|null};
export type AssessmentRunRow = {id:string;evaluation_id:string;attempt_id:string;role:'primary'|'escalation';mode:string;evaluator_profile:string;provider:string;model:string;policy_version:string;schema_version:string;profile_version:string;intent:string|null;validated_result:Json;status:string;schema_valid:boolean;semantic_valid:boolean;issue_codes:Json;escalation_reason:Json;input_tokens:number|null;output_tokens:number|null;cached_tokens:number|null;usage_status:string;latency_ms:number|null;estimated_cost:number|null;cost_status:string;error_type:string|null;created_at:string};
