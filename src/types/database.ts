// Hand-maintained for the M2 SQL migration; replace with generated Supabase types after setup.
import type { ProblemPublic } from './problem';
import type { ProblemEvaluationPackage } from './evaluation';
import type { ChatMessage } from './attempt';
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type ProfileRow = { user_id: string; role: 'user' | 'admin'; created_at: string; updated_at: string };
export type CategoryRow = { id: string; slug: string; name: string; parent_id: string | null; description: string | null; sort_order: number; created_at: string; updated_at: string };
export type ProblemRow = { id: string; slug: string; status: ProblemPublic['status']; current_version_id: string | null; published_at: string | null; created_at: string; updated_at: string };
export type VersionRow = { id: string; problem_id: string; version_number: number; title: string; short_description: string; scenario: string; question: string; assumptions: string[]; visualization: ProblemPublic['visualization']; question_type: ProblemPublic['questionType']; competency_ids: string[]; difficulty: ProblemPublic['difficulty']; tags: string[]; origin: 'original_mock'; created_at: string };
export type ProblemCategoryRow = { problem_id: string; category_id: string; is_primary: boolean };
export type PackageRow = { id: string; problem_version_id: string; reference_answer: string; reasoning_rubric: ProblemEvaluationPackage['reasoningRubric']; acceptable_alternative_approaches: ProblemEvaluationPackage['acceptableAlternativeApproaches']; misconceptions: ProblemEvaluationPackage['misconceptions']; hint_ladder: ProblemEvaluationPackage['hintLadder']; completion_criteria: ProblemEvaluationPackage['completionCriteria']; evaluation_examples: ProblemEvaluationPackage['evaluationExamples']; created_at: string; updated_at: string };
export type AttemptRow = { id: string; user_id: string; problem_id: string; problem_version_id: string; status: 'in_progress' | 'completed' | 'abandoned'; reasoning_state: Json; started_at: string; completed_at: string | null; updated_at: string };
export type MessageRow = { id: string; attempt_id: string; sequence_number: number; role: ChatMessage['role']; content: string; request_id: string | null; created_at: string };
export type HintEventRow = { id: string; attempt_id: string; hint_id: string; hint_level: number; displayed_text: string; created_at: string };
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>; categories: Table<CategoryRow>; problems: Table<ProblemRow>;
      problem_versions: Table<VersionRow>; problem_categories: Table<ProblemCategoryRow>;
      problem_evaluation_packages: Table<PackageRow>; attempts: Table<AttemptRow>;
      attempt_messages: Table<MessageRow>; hint_events: Table<HintEventRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      start_interview: { Args: { p_problem_id: string }; Returns: string };
      append_interview_turn: { Args: { p_attempt_id: string; p_content: string; p_request_id: string }; Returns: string };
      request_interview_hint: { Args: { p_attempt_id: string }; Returns: string };
      finish_interview: { Args: { p_attempt_id: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
