import postgres from "postgres";
import { defaultOllamaProvider } from "./ollama.ts";
import type { LlmProvider } from "./types.ts";

const TIMEOUT_MS = 15_000;

export function parseDescription(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const description = (value as Record<string, unknown>).description;
  if (typeof description !== "string") {
    return null;
  }
  const trimmed = description.replace(/\s+/g, " ").trim();
  if (trimmed.length < 4 || trimmed.length > 160) {
    return null;
  }
  return trimmed;
}

export async function refineDescription(
  content: string,
  provider: LlmProvider,
  timeoutMs: number = TIMEOUT_MS,
): Promise<string | null> {
  const excerpt = content.slice(0, 4000);
  const prompt = `用一句中文概括下面文档，只输出 JSON：{"description":"..."}。不要输出其它字段或解释。\n\n${excerpt}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const parsed = await Promise.race([
      provider.completeJson(prompt, timeoutMs),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("llm refine timeout")), timeoutMs);
      }),
    ]);
    return parseDescription(parsed);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function attachDescription(
  databaseUrl: string,
  documentId: string,
  content: string,
  provider: LlmProvider | null,
): Promise<string | null> {
  if (provider === null) {
    return null;
  }
  try {
    const description = await refineDescription(content, provider);
    if (description === null) {
      return null;
    }
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
    try {
      await sql`UPDATE documents SET description = ${description}, updated_at = now() WHERE id = ${documentId}`;
    } finally {
      await sql.end({ timeout: 1 });
    }
    return description;
  } catch {
    return null;
  }
}

export function providerForRuntime(override?: LlmProvider | null): LlmProvider | null {
  if (override !== undefined) {
    return override;
  }
  if (process.env.NODE_TEST_CONTEXT !== undefined) {
    return null;
  }
  return defaultOllamaProvider();
}
