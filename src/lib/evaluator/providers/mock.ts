import type { EvaluationInput, EvaluatorProvider, ProviderEvaluationResponse } from '../contracts.ts';
import { unavailableUsage } from '../contracts.ts';

/** Injectable deterministic transport fixture, NOT an evaluator accuracy claim. */
export class MockEvaluatorProvider implements EvaluatorProvider {
  calls = 0;
  private readonly response: (input: EvaluationInput, call: number) => string | Promise<string>;
  constructor(response: (input: EvaluationInput, call: number) => string | Promise<string>) {this.response=response;}
  async evaluate(input: EvaluationInput): Promise<ProviderEvaluationResponse> {
    this.calls++; return {raw:await this.response(input,this.calls),usage:unavailableUsage()};
  }
}
