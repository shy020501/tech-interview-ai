import type { EvaluationResult, RubricAssessment } from "./evaluation";

export interface ChatMessage {
  id: string;
  role: "user" | "interviewer" | "system_hint";
  content: string;
  createdAt: string;
}

/** Server-owned state: later evidence may replace confirmed with partial, etc. */
export interface ReasoningState {
  revision: number;
  assessments: Record<string, RubricAssessment>;
  contradictions: EvaluationResult["contradictions"];
  updatedAt: string;
}

export interface Attempt {
  id: string;
  problemVersionId: string;
  status: "in_progress" | "completed" | "abandoned";
  messages: ChatMessage[];
  reasoningState: ReasoningState;
  hintsUsed: { hintId: string; requestedAt: string }[];
  startedAt: string;
  completedAt: string | null;
}

/** M1 browser state has no private rubric assessments or evaluator internals. */
export interface MockAttemptSession {
  id: string;
  problemVersionId: string;
  status: "in_progress" | "completed";
  messages: ChatMessage[];
  hintsUsed: { hintId: string; requestedAt: string }[];
  demoProgress: number;
  startedAt: string;
  completedAt: string | null;
}

/** Public persistence projection. Never includes reasoning_state or evaluation packages. */
export interface AttemptSession {
  id: string;
  problemId: string;
  problemVersionId: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  messages: ChatMessage[];
  hintsUsed: { hintId: string; requestedAt: string; displayedText: string }[];
  demoProgress: number;
  startedAt: string;
  completedAt: string | null;
}
export type AttemptActionResult = { ok: true; attempt: AttemptSession } | { ok: false; error: string; signIn?: boolean };
