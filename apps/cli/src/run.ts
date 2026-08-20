import {
  DependencyError,
  doctorReport,
  HybridRetriever,
  rerankOptionsFromEnv,
  getDocument,
  ingestLocalFile,
  ingestLarkMinute,
  ingestUrls,
  listLarkMinutes,
  listTagProposals,
  listTags,
  loadEnvFiles,
  NotFoundError,
  approveTagProposal,
  rejectTagProposal,
  repoRootFrom,
  embedMissingChunks,
  TeiEmbedder,
} from "@summer-sum/core";
import type { SearchQuery } from "@summer-sum/core";
import { parseArgs, parseDateFlag } from "./args.ts";
import { CliExit, EXIT, usage, batchIngestExit } from "./exit.ts";
import {
  formatDoctorHuman,
  formatGetHuman,
  formatGetJson,
  formatIngestHuman,
  formatIngestJson,
  formatSearchHuman,
  formatSearchJson,
  formatTagsHuman,
  printJson,
} from "./format.ts";

function writeOut(text: string): void {
  process.stdout.write(text);
}

function writeErr(text: string): void {
  process.stderr.write(text);
}

function loadConfig(args: ReturnType<typeof parseArgs>) {
  const root = repoRootFrom(import.meta.url);
  loadEnvFiles(root);
  return {
    databaseUrl: args.databaseUrl ?? process.env.KB_DATABASE_URL ?? "",
    teiUrl: args.teiUrl ?? process.env.KB_TEI_URL ?? "http://localhost:8080",
    ollamaUrl: args.ollamaUrl ?? process.env.KB_OLLAMA_URL ?? "http://localhost:11434",
    remoteUrl: process.env.KB_REMOTE_URL,
    root,
  };
}

function requireDatabaseUrl(url: string): string {
  if (url.length === 0) {
    throw new DependencyError("KB_DATABASE_URL is not set");
  }
  return url;
}

function toSearchQuery(query: string, args: ReturnType<typeof parseArgs>): SearchQuery {
  const input: SearchQuery = { query };
  if (args.tags.length > 0) {
    input.tags = args.tags;
  }
  if (args.kind !== undefined) {
    input.kind = args.kind;
  }
  if (args.limit !== undefined) {
    input.limit = args.limit;
  }
  if (args.since !== undefined) {
    input.since = parseDateFlag(args.since, "--since");
  }
  if (args.until !== undefined) {
    input.until = parseDateFlag(args.until, "--until");
  }
  return input;
}

async function dispatch(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const cfg = loadConfig(args);
  if (args.remote || (cfg.remoteUrl !== undefined && cfg.remoteUrl.length > 0)) {
    usage("remote mode is not implemented yet; omit --remote and KB_REMOTE_URL to use the local database");
  }
  const command = args.positional[0];
  if (command === undefined) {
    usage("usage: kb <ingest|search|get|tags|doctor|embed> [...]");
  }

  if (command === "ingest") {
    const target = args.positional[1];
    if (target === "lark") {
      const sub = args.positional[2];
      if (sub === "list") {
        const rows = await listLarkMinutes();
        if (args.json) {
          printJson(rows);
        } else if (rows.length === 0) {
          writeOut("No minutes.\n");
        } else {
          writeOut(`${rows.map((row) => `${row.token}\t${row.title}`).join("\n")}\n`);
        }
        return EXIT.ok;
      }
      const token = args.latest ? (await listLarkMinutes())[0]?.token : sub;
      if (token === undefined) {
        usage("usage: kb ingest lark <minute_token|list|--latest>");
      }
      const result = await ingestLarkMinute(token, requireDatabaseUrl(cfg.databaseUrl));
      if (args.json) {
        printJson({
          document_id: result.documentId,
          action: result.action,
          chunk_count: result.chunkCount,
          ingest_run_id: result.ingestRunId,
          minute_token: result.minuteToken,
        });
      } else {
        writeOut(`${result.action} ${result.documentId} chunks=${result.chunkCount} token=${result.minuteToken}\n`);
      }
      return EXIT.ok;
    }
    if (target === "url") {
      const urls = args.positional.slice(2);
      if (urls.length === 0) {
        usage("usage: kb ingest url <url> [url...]");
      }
      const batch = await ingestUrls(urls, requireDatabaseUrl(cfg.databaseUrl));
      if (args.json) {
        printJson({
          successes: batch.successes.map((row) => ({
            document_id: row.documentId,
            action: row.action,
            chunk_count: row.chunkCount,
            source_url: row.sourceUrl,
          })),
          failures: batch.failures.map((row) => ({
            url: row.url,
            source_ref: row.sourceRef,
            reason: row.reason,
          })),
        });
      } else {
        for (const row of batch.successes) {
          writeOut(`${row.action} ${row.documentId} ${row.sourceUrl}\n`);
        }
        for (const row of batch.failures) {
          writeErr(`failed ${row.url}: ${row.reason}\n`);
        }
      }
      return batchIngestExit(batch.successes.length, batch.failures.length);
    }
    const filePath = args.positional[2];
    if (target !== "file" || filePath === undefined) {
      usage("usage: kb ingest file <path> | kb ingest lark <minute_token|list|--latest> | kb ingest url <url>");
    }
    const result = await ingestLocalFile(filePath, requireDatabaseUrl(cfg.databaseUrl));
    if (args.json) {
      printJson(formatIngestJson(result));
    } else {
      writeOut(formatIngestHuman(result));
    }
    return EXIT.ok;
  }

  if (command === "search") {
    const query = args.positional[1];
    if (query === undefined || query.length === 0) {
      usage("usage: kb search <query>");
    }
    const retriever = new HybridRetriever(
      requireDatabaseUrl(cfg.databaseUrl),
      new TeiEmbedder(cfg.teiUrl, process.env.KB_EMBED_MODEL ?? "BAAI/bge-m3"),
      rerankOptionsFromEnv(),
    );
    const response = await retriever.search(toSearchQuery(query, args));
    if (args.json) {
      printJson(formatSearchJson(response));
    } else {
      writeOut(formatSearchHuman(response));
    }
    return EXIT.ok;
  }

  if (command === "get") {
    const id = args.positional[1];
    if (id === undefined) {
      usage("usage: kb get <id>");
    }
    const doc = await getDocument(id, requireDatabaseUrl(cfg.databaseUrl));
    if (args.json) {
      printJson(formatGetJson(doc));
    } else {
      writeOut(formatGetHuman(doc));
    }
    return EXIT.ok;
  }

  if (command === "tags") {
    const dbUrl = requireDatabaseUrl(cfg.databaseUrl);
    const sub = args.positional[1];
    if (sub === undefined || sub === "list") {
      const rows = await listTags(dbUrl);
      if (args.json) {
        printJson(rows);
      } else {
        writeOut(formatTagsHuman(rows));
      }
      return EXIT.ok;
    }
    if (sub === "proposals") {
      const rows = await listTagProposals(dbUrl);
      if (args.json) {
        printJson(
          rows.map((row) => ({
            id: row.id,
            proposed_name: row.proposedName,
            reason: row.reason,
            document_id: row.documentId,
            status: row.status,
            created_at: row.createdAt,
          })),
        );
      } else if (rows.length === 0) {
        writeOut("No tag proposals.\n");
      } else {
        writeOut(
          `${rows.map((row) => `${row.id}\t${row.status}\t${row.proposedName ?? ""}\t${row.reason ?? ""}`).join("\n")}\n`,
        );
      }
      return EXIT.ok;
    }
    const proposalId = args.positional[2];
    if ((sub === "approve" || sub === "reject") && proposalId !== undefined) {
      if (sub === "approve") {
        const tag = await approveTagProposal(dbUrl, proposalId);
        if (args.json) {
          printJson(tag);
        } else {
          writeOut(`approved ${tag.slug}\n`);
        }
      } else {
        await rejectTagProposal(dbUrl, proposalId);
        if (args.json) {
          printJson({ id: proposalId, status: "rejected" });
        } else {
          writeOut(`rejected ${proposalId}\n`);
        }
      }
      return EXIT.ok;
    }
    usage("usage: kb tags [list|proposals|approve <id>|reject <id>]");
  }

  if (command === "embed") {
    const result = await embedMissingChunks(
      requireDatabaseUrl(cfg.databaseUrl),
      new TeiEmbedder(cfg.teiUrl, process.env.KB_EMBED_MODEL ?? "BAAI/bge-m3"),
    );
    if (args.json) {
      printJson({
        embedded: result.embedded,
        skipped: result.skipped,
        model_name: result.modelName,
        dim: result.dim,
        index_name: result.indexName,
      });
    } else {
      writeOut(
        `embedded=${result.embedded} skipped=${result.skipped} model=${result.modelName} index=${result.indexName}\n`,
      );
    }
    return EXIT.ok;
  }

  if (command === "doctor") {
    const report = await doctorReport({
      databaseUrl: cfg.databaseUrl,
      teiUrl: cfg.teiUrl,
      ollamaUrl: cfg.ollamaUrl,
    });
    if (args.json) {
      printJson(report);
    } else {
      writeOut(formatDoctorHuman(report));
    }
    return report.ok ? EXIT.ok : EXIT.unavailable;
  }

  usage(`unknown command: ${command}`);
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    return await dispatch(argv);
  } catch (error) {
    if (error instanceof CliExit) {
      writeErr(`${error.message}\n`);
      return error.code;
    }
    if (error instanceof NotFoundError) {
      writeErr(`${error.message}\n`);
      return EXIT.notFound;
    }
    if (error instanceof DependencyError) {
      writeErr(`${error.message}\n`);
      return EXIT.unavailable;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeErr(`${message}\n`);
    return EXIT.error;
  }
}
