import postgres from "postgres";

export type DoctorItem = {
  name: string;
  required: boolean;
  status: "ok" | "fail" | "degraded";
  detail: string;
};

export type DoctorReport = {
  ok: boolean;
  items: DoctorItem[];
};

async function inspectTei(teiUrl: string): Promise<{ reachable: boolean; modelName: string | null }> {
  const base = teiUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${base}/info`, { signal: controller.signal });
    if (!response.ok) {
      return { reachable: true, modelName: null };
    }
    const payload: unknown = await response.json();
    const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const modelName = typeof record.model_id === "string" ? record.model_id : null;
    return { reachable: true, modelName };
  } catch {
    return { reachable: false, modelName: null };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectOllama(ollamaUrl: string, model: string): Promise<{ reachable: boolean; modelReady: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      return { reachable: true, modelReady: false };
    }
    const payload: unknown = await response.json();
    const models =
      typeof payload === "object" && payload !== null && Array.isArray((payload as { models?: unknown }).models)
        ? ((payload as { models: Array<{ name?: string }> }).models)
        : [];
    const modelReady = models.some((row) => typeof row.name === "string" && (row.name === model || row.name.startsWith(`${model}:`)));
    return { reachable: true, modelReady };
  } catch {
    return { reachable: false, modelReady: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function doctorReport(input: {
  databaseUrl: string;
  teiUrl: string;
  ollamaUrl: string;
}): Promise<DoctorReport> {
  const items: DoctorItem[] = [];
  if (input.databaseUrl.length === 0) {
    items.push({
      name: "postgres",
      required: true,
      status: "fail",
      detail: "KB_DATABASE_URL is not set",
    });
  } else {
  try {
    const sql = postgres(input.databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
    try {
      await sql`SELECT 1`;
      const ext = await sql<{ extversion: string }[]>`
        SELECT extversion FROM pg_extension WHERE extname = 'vector'
      `;
      let migrations = "unknown";
      try {
        const applied = await sql<{ id: string }[]>`SELECT id FROM schema_migrations ORDER BY id`;
        migrations = applied.length > 0 ? applied.map((row) => row.id).join(",") : "none";
      } catch {
        migrations = "schema_migrations missing";
      }
      items.push({
        name: "postgres",
        required: true,
        status: ext.length > 0 ? "ok" : "fail",
        detail:
          ext.length > 0
            ? `connected, vector ${ext[0]?.extversion}, migrations ${migrations}`
            : "connected, pgvector missing",
      });
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    items.push({ name: "postgres", required: true, status: "fail", detail: message });
  }
  }

  const tei = await inspectTei(input.teiUrl);
  items.push({
    name: "tei",
    required: false,
    status: tei.reachable ? "ok" : "degraded",
    detail: tei.reachable ? input.teiUrl : `unreachable: ${input.teiUrl}`,
  });
  items.push({
    name: "tei_model",
    required: false,
    status: tei.modelName !== null ? "ok" : "degraded",
    detail: tei.modelName ?? "model unknown",
  });

  const ollamaModel = process.env.KB_LLM_MODEL ?? "qwen3:8b";
  const ollama = await inspectOllama(input.ollamaUrl, ollamaModel);
  items.push({
    name: "ollama",
    required: false,
    status: ollama.reachable ? "ok" : "degraded",
    detail: ollama.reachable ? input.ollamaUrl : `unreachable: ${input.ollamaUrl}`,
  });
  items.push({
    name: "ollama_model",
    required: false,
    status: ollama.modelReady ? "ok" : "degraded",
    detail: ollama.modelReady ? `${ollamaModel} ready` : `${ollamaModel} not ready`,
  });

  return {
    ok: items.filter((item) => item.required).every((item) => item.status === "ok"),
    items,
  };
}
