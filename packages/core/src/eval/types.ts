export type EvalExpect = "pass" | "known-fail";
export type EvalCategory = "keyword" | "synonym" | "tag" | "none";
export type CaseStatus = "pass" | "known-fail" | "unexpected-fail" | "unexpected-pass";

export type CorpusTag = { slug: string; name: string };

export type CorpusEntry = {
  path: string;
  tags: CorpusTag[];
};

export type EvalCase = {
  id: string;
  category: EvalCategory;
  query: string;
  expectedFixtures: string[];
  tags?: string[];
  expect: EvalExpect;
  reason?: string;
};

export type EvalSuite = {
  version: number;
  corpus: CorpusEntry[];
  cases: EvalCase[];
};

export type CaseResult = {
  id: string;
  category: EvalCategory;
  query: string;
  expect: EvalExpect;
  status: CaseStatus;
  expectedIds: string[];
  actualIds: string[];
  reason: string | null;
};

export type EvalReport = {
  stage: "fulltext" | "hybrid";
  total: number;
  pass: number;
  knownFail: number;
  unexpectedFail: number;
  unexpectedPass: number;
  hitRate: number;
  results: CaseResult[];
};

export function expectedHit(expectedIds: string[], actualIds: string[]): boolean {
  if (expectedIds.length === 0) {
    return actualIds.length === 0;
  }
  return expectedIds.every((id) => actualIds.includes(id));
}

export function classifyCase(expect: EvalExpect, hit: boolean): CaseStatus {
  if (expect === "known-fail") {
    return hit ? "unexpected-pass" : "known-fail";
  }
  return hit ? "pass" : "unexpected-fail";
}

export function summarize(results: CaseResult[], stage: EvalReport["stage"] = "fulltext"): EvalReport {
  const pass = results.filter((row) => row.status === "pass").length;
  const knownFail = results.filter((row) => row.status === "known-fail").length;
  const unexpectedFail = results.filter((row) => row.status === "unexpected-fail").length;
  const unexpectedPass = results.filter((row) => row.status === "unexpected-pass").length;
  const expectedPass = results.filter((row) => row.expect === "pass").length;
  const hitRate = expectedPass === 0 ? 0 : pass / expectedPass;
  return {
    stage,
    total: results.length,
    pass,
    knownFail,
    unexpectedFail,
    unexpectedPass,
    hitRate,
    results,
  };
}
