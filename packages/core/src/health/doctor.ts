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

async function ping(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { signal: controller.signal });
    return true;
  } catch {
    return false;
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

  const teiOk = await ping(input.teiUrl, 1500);
  items.push({
    name: "tei",
    required: false,
    status: teiOk ? "ok" : "degraded",
    detail: teiOk ? input.teiUrl : `unreachable: ${input.teiUrl}`,
  });

  const ollamaOk = await ping(input.ollamaUrl, 1500);
  items.push({
    name: "ollama",
    required: false,
    status: ollamaOk ? "ok" : "degraded",
    detail: ollamaOk ? input.ollamaUrl : `unreachable: ${input.ollamaUrl}`,
  });

  return {
    ok: items.filter((item) => item.required).every((item) => item.status === "ok"),
    items,
  };
}
