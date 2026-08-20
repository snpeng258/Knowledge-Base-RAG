import { DependencyError, isUnavailableMessage } from "../errors.ts";
import type { Embedder } from "./types.ts";

export type { Embedder } from "./types.ts";

const DEFAULT_MODEL = "BAAI/bge-m3";
const DEFAULT_DIM = 1024;

export class TeiEmbedder implements Embedder {
  readonly name = "tei";
  readonly modelName: string;
  readonly dim: number;
  private readonly baseUrl: string;

  constructor(baseUrl: string, modelName: string = DEFAULT_MODEL, dim: number = DEFAULT_DIM) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.modelName = modelName;
    this.dim = dim;
  }

  async info(): Promise<{ modelName: string }> {
    const response = await fetch(`${this.baseUrl}/info`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) {
      throw new Error(`tei info http ${response.status}`);
    }
    const payload: unknown = await response.json();
    const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const modelName = typeof record.model_id === "string" ? record.model_id : this.modelName;
    return { modelName };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    try {
      const response = await fetch(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputs: texts }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new DependencyError(`tei embed http ${response.status} at ${this.baseUrl}`);
      }
      const payload: unknown = await response.json();
      const rows = parseEmbeddingMatrix(payload);
      if (rows.length !== texts.length) {
        throw new Error(`tei returned ${rows.length} vectors for ${texts.length} inputs`);
      }
      return rows;
    } catch (error) {
      if (error instanceof DependencyError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (isUnavailableMessage(message) || /fetch failed|AbortError|timeout/i.test(message)) {
        throw new DependencyError(`tei unavailable at ${this.baseUrl}: ${message}`);
      }
      throw error;
    }
  }
}

export function defaultTeiEmbedder(): TeiEmbedder {
  const baseUrl = process.env.KB_TEI_URL ?? "http://localhost:8080";
  const modelName = process.env.KB_EMBED_MODEL ?? DEFAULT_MODEL;
  return new TeiEmbedder(baseUrl, modelName, DEFAULT_DIM);
}

export function parseEmbeddingMatrix(value: unknown): number[][] {
  if (!Array.isArray(value)) {
    throw new Error("tei embed response is not an array");
  }
  return value.map((row) => {
    if (!Array.isArray(row) || !row.every((item) => typeof item === "number")) {
      throw new Error("tei embed row is not a number array");
    }
    return row as number[];
  });
}
