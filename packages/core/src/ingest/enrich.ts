import { attachDescription, providerForRuntime } from "../llm/refine.ts";
import { attachTags } from "../llm/tagging.ts";
import type { LlmProvider } from "../llm/types.ts";

export async function enrichIngestedDocument(
  databaseUrl: string,
  documentId: string,
  content: string,
  override?: LlmProvider | null,
): Promise<void> {
  const provider = providerForRuntime(override);
  await attachDescription(databaseUrl, documentId, content, provider);
  await attachTags(databaseUrl, documentId, content, provider);
}
