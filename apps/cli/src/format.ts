import type { DoctorReport, DocumentRecord, IngestFileResult, SearchResponse } from "@summer-sum/core";

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function formatSearchJson(response: SearchResponse): unknown {
  return {
    query: response.query,
    stage: response.stage,
    degraded: response.degraded,
    total: response.total,
    results: response.results.map((card) => ({
      id: card.id,
      kind: card.kind,
      title: card.title,
      description: card.description,
      tags: card.tags,
      occurred_at: card.occurredAt,
      source_url: card.sourceUrl,
      score: card.score,
      hits: card.hits.map((hit) => ({
        chunk_ord: hit.chunkOrd,
        snippet: hit.snippet,
        char_start: hit.charStart,
        char_end: hit.charEnd,
        speaker: hit.speaker,
        ts_start: hit.tsStart,
      })),
    })),
  };
}

export function formatSearchHuman(response: SearchResponse): string {
  if (response.results.length === 0) {
    return "No results.\n";
  }
  const lines: string[] = [];
  for (const card of response.results) {
    lines.push(`${card.id}  [${card.kind}]  ${card.title}`);
    const snippet = card.hits[0]?.snippet ?? card.description ?? "";
    if (snippet.length > 0) {
      lines.push(`  ${snippet.replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function countHumanSearchResults(text: string): number {
  if (text === "No results.\n") {
    return 0;
  }
  return text.split("\n").filter((line) => /^\S+\s+\[[^\]]+\]\s+/.test(line)).length;
}

export function formatGetJson(doc: DocumentRecord): unknown {
  return {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    description: doc.description,
    tags: doc.tags,
    occurred_at: doc.occurredAt,
    source: doc.source,
    content: doc.content,
  };
}

export function formatGetHuman(doc: DocumentRecord): string {
  return `${doc.id}  [${doc.kind}]  ${doc.title}\n\n${doc.content}\n`;
}

export function formatTagsHuman(rows: { slug: string; name: string; description?: string | null }[]): string {
  if (rows.length === 0) {
    return "No tags.\n";
  }
  return `${rows.map((row) => `${row.slug}\t${row.name}\t${row.description ?? ""}`).join("\n")}\n`;
}

export function formatDoctorHuman(report: DoctorReport): string {
  return `${report.items.map((item) => `${item.status.padEnd(8)} ${item.name.padEnd(10)} ${item.detail}`).join("\n")}\n`;
}

export function formatIngestJson(result: IngestFileResult): unknown {
  return {
    document_id: result.documentId,
    action: result.action,
    chunk_count: result.chunkCount,
    ingest_run_id: result.ingestRunId,
  };
}

export function formatIngestHuman(result: IngestFileResult): string {
  return `${result.action} ${result.documentId} chunks=${result.chunkCount}\n`;
}
