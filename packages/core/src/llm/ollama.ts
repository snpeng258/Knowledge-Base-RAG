import type { LlmProvider } from "./types.ts";

export class OllamaProvider implements LlmProvider {
  readonly name = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  async completeJson(prompt: string, timeoutMs: number): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        format: "json",
        think: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`ollama http ${response.status}`);
    }
    const payload: unknown = await response.json();
    const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const message = typeof record.message === "object" && record.message !== null ? (record.message as Record<string, unknown>) : {};
    const content = typeof message.content === "string" ? message.content : typeof record.response === "string" ? record.response : "";
    if (content.length === 0) {
      throw new Error("ollama returned empty content");
    }
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error("ollama returned non-json content");
    }
  }
}

export function defaultOllamaProvider(): OllamaProvider {
  const baseUrl = process.env.KB_OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.KB_LLM_MODEL ?? "qwen3:8b";
  return new OllamaProvider(baseUrl, model);
}
