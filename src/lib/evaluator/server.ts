import 'server-only';

// Shared engine exports for trusted server code; live orchestration is in live/server.ts.
// Pure modules stay Node-testable; browser import graphs additionally reject this directory.
export { buildCompactPackage, buildEvaluationInput } from './input.ts';
export { evaluate } from './engine.ts';
export { parseEvaluatorRegistry, selectEvaluatorProfile } from './registry.ts';
export { reduceReasoningState, calculateProgress, isComplete, selectHintTarget } from './state.ts';
export { shouldEscalate } from './escalation.ts';
export { preGuard, nextAbuseStrikes } from './guards.ts';
