import type { DoctorReport, DocumentRecord, IngestFileResult, SearchResponse } from "@summer-sum/core";
export { formatGetJson, formatSearchJson } from "@summer-sum/core";

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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
