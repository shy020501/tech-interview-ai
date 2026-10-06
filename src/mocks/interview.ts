// Legacy M1 fixture for domain tests only. Persisted M2 turns are produced atomically by the database RPC.
import type { ChatMessage, MockAttemptSession } from "@/types/attempt";
import type { ProblemPublic } from "@/types/problem";

const sampleTime = "2026-10-05T09:00:00.000Z";
const openings: Record<string, { user: string; interviewer: string }> = {
  "pv-drone-1": { user: "The failure seems related to differences in the physical dynamics between simulation and the real drone.", interviewer: "That is a relevant observation. You have identified why deployment can fail, but you have not yet explained what learning signal would make the latent representation capture those dynamics." },
  "pv-camera-1": { user: "I would first establish whether the change is specific to the new camera.", interviewer: "That is a useful starting point for the sample discussion. Explain your assumptions and how you would support your reasoning." },
  "pv-representation-1": { user: "A smaller vector is not necessarily a more useful representation.", interviewer: "You have identified the distinction in this sample discussion. Develop your explanation in your own words." },
};

const feedback = [
  "Response recorded. Continue explaining the assumptions behind your approach. This preview does not assess correctness.",
  "Your reasoning has been added to the conversation. You can refine an earlier statement or explain a limitation.",
  "Response recorded. You can continue your explanation, request the optional hint, or finish for the reference debrief.",
];

export function createMockAttempt(problem: ProblemPublic): MockAttemptSession {
  const opening = openings[problem.versionId];
  return {
    id: `mock-attempt-${problem.versionId}`, problemVersionId: problem.versionId, status: "in_progress",
    messages: opening ? [
      { id: "sample-user", role: "user", content: opening.user, createdAt: sampleTime },
      { id: "sample-interviewer", role: "interviewer", content: opening.interviewer, createdAt: sampleTime },
    ] : [],
    hintsUsed: [], demoProgress: 50, startedAt: sampleTime, completedAt: null,
  };
}

/** Script playback, intentionally content-independent. This is not an evaluator. */
export function appendMockTurn(attempt: MockAttemptSession, input: string, now: string): MockAttemptSession {
  const content = input.trim();
  if (!content || content.length > 4000 || attempt.status === "completed") return attempt;
  const turn = attempt.messages.filter((message) => message.role === "user" && message.id !== "sample-user").length;
  const messages: ChatMessage[] = [
    { id: `${attempt.id}-user-${turn}`, role: "user", content, createdAt: now },
    { id: `${attempt.id}-interviewer-${turn}`, role: "interviewer", content: feedback[Math.min(turn, feedback.length - 1)], createdAt: now },
  ];
  // Illustrative steps only. Future progress is computed on the server from reasoning state.
  return { ...attempt, messages: [...attempt.messages, ...messages], demoProgress: [60, 70, 75][Math.min(turn, 2)] };
}
