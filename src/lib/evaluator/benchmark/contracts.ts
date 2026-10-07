import type { CompactPackage, EvaluationInput, EvaluationMessage, EvaluatorResult, EvaluatorState, Intent, NodeStatus } from '../contracts.ts';
import type { EvaluationRun } from '../engine.ts';
import type { GuardContext, GuardReason } from '../guards.ts';

export type BenchmarkSplit = 'calibration' | 'holdout';
export interface BenchmarkAnnotation {
  datasetVersion: string;
  split: BenchmarkSplit;
  family: string;
  author: 'ai_draft';
  reviewStatus: 'needs_human_review';
  reviewPriority: 'routine' | 'boundary';
  rationale: string;
  rubricRationale: Record<string, string>;
  supersedes?: string[];
}

export interface BenchmarkCase {
  id: string; source:'global_fixture'|'m3_example'|'curated_fixture'; tags:string[]; problem:CompactPackage;
  annotation?: BenchmarkAnnotation;
  message:EvaluationMessage; recentContext?:EvaluationMessage[]; initialState?:EvaluatorState;
  evaluationMode?:EvaluationInput['evaluationMode']; guardContext?:GuardContext;
  expected: {
    intent?:Intent; rubricStatuses:Record<string,NodeStatus>; misconceptionIds?:string[];
    needsEscalation?:boolean; guardReason?:GuardReason;
    evidenceRequiredFor?:string[];
  };
  // Only the mock transport sees this. It is NEVER part of EvaluationInput or a live prompt.
  mockOutput:EvaluatorResult;
}
export interface CaseReport {
  caseId:string;source:BenchmarkCase['source'];tags:string[];profileId:string;problemVersionId:string;
  annotation?: Pick<BenchmarkAnnotation,'datasetVersion'|'split'|'family'|'author'|'reviewStatus'|'reviewPriority'>;
  rubricNodeCount: number;
  expected:BenchmarkCase['expected'];status:EvaluationRun['status'];guardReason:EvaluationRun['guardReason'];
  errorType:EvaluationRun['errorType'];issueCodes:string[];requests:EvaluationRun['requests'];
  retryCount:number;latencyMs:number;escalation:EvaluationRun['escalation'];
  // Quotes/user text/raw output/prompt/private criteria are deliberately omitted from artifacts.
  predicted:null|{intent:Intent;rubricStatuses:Record<string,NodeStatus>;misconceptionIds:string[];needsEscalation:boolean};
  evidenceRequirementsMet:boolean|null;progress:number|null;complete:boolean|null;
  cost:{amount:number|null;currency:'USD';usageStatus:'exact'|'estimated'|'unavailable';reason:string|null};
}
