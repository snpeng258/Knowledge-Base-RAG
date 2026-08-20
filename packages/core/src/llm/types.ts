export type LlmProvider = {
  readonly name: string;
  completeJson(prompt: string, timeoutMs: number): Promise<unknown>;
};
