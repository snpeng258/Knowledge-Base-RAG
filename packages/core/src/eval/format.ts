import type { EvalReport } from "./types.ts";

export function formatEvalJson(report: EvalReport): unknown {
  return {
    stage: report.stage,
    total: report.total,
    pass: report.pass,
    known_fail: report.knownFail,
    unexpected_fail: report.unexpectedFail,
    unexpected_pass: report.unexpectedPass,
    hit_rate: report.hitRate,
    results: report.results.map((row) => ({
      id: row.id,
      category: row.category,
      query: row.query,
      expect: row.expect,
      status: row.status,
      expected_ids: row.expectedIds,
      actual_ids: row.actualIds,
      reason: row.reason,
    })),
  };
}

export function formatEvalHuman(report: EvalReport): string {
  const lines = [
    `stage=${report.stage} hit_rate=${report.hitRate.toFixed(3)} total=${report.total}`,
    `pass=${report.pass} known_fail=${report.knownFail} unexpected_fail=${report.unexpectedFail} unexpected_pass=${report.unexpectedPass}`,
    "",
  ];
  for (const row of report.results) {
    lines.push(`${row.status.padEnd(16)} ${row.id}  q=${row.query}`);
  }
  return `${lines.join("\n")}\n`;
}
