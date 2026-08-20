import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DependencyError } from "../errors.ts";
import { asRecord, asString, extractMinutes, isLarkAuthFailure, parseTime } from "./parse.ts";

export type LarkMinuteSummary = {
  token: string;
  title: string;
  occurredAt: Date | null;
  url: string | null;
};

export type LarkMinuteTranscript = LarkMinuteSummary & {
  transcript: string;
};

export type LarkMinutesClient = {
  listMinutes(): Promise<LarkMinuteSummary[]>;
  fetchTranscript(token: string): Promise<LarkMinuteTranscript>;
};

function larkBin(): string {
  return process.platform === "win32" ? "lark-cli.cmd" : "lark-cli";
}

function runLark(args: string[]): { stdout: string; stderr: string } {
  const spawned = spawnSync(larkBin(), args, {
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
    shell: process.platform === "win32",
  });
  const stdout = spawned.stdout ?? "";
  const stderr = spawned.stderr ?? "";
  const combined = `${stdout}\n${stderr}`;
  if (spawned.error !== undefined) {
    throw new DependencyError(`lark-cli is unavailable: ${spawned.error.message}`);
  }
  if (spawned.status !== 0) {
    if (isLarkAuthFailure(spawned.status, combined)) {
      throw new DependencyError(`lark authorization failed: ${stderr.trim() || stdout.trim() || `exit ${spawned.status}`}`);
    }
    throw new DependencyError(`lark-cli failed (${spawned.status}): ${stderr.trim() || stdout.trim() || "no output"}`);
  }
  return { stdout, stderr };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new DependencyError("lark-cli did not return JSON");
  }
}

function summaryFromRecord(record: Record<string, unknown>): LarkMinuteSummary | undefined {
  const token =
    asString(record.minute_token) ?? asString(record.token) ?? asString(asRecord(record.minute)?.minute_token);
  if (token === undefined) {
    return undefined;
  }
  const title = asString(record.title) ?? asString(asRecord(record.minute)?.title) ?? token;
  const occurredAt =
    parseTime(record.start_time) ??
    parseTime(record.create_time) ??
    parseTime(asRecord(record.minute)?.start_time) ??
    parseTime(record.created_at);
  const url = asString(record.url) ?? asString(record.share_url) ?? asString(asRecord(record.minute)?.url) ?? null;
  return { token, title, occurredAt, url };
}

async function readTranscriptFile(dir: string, hinted: string | undefined): Promise<string> {
  if (hinted !== undefined) {
    return (await readFile(hinted, "utf8")).replace(/\r\n/g, "\n");
  }
  const { readdir } = await import("node:fs/promises");
  async function walk(current: string): Promise<string | undefined> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        const nested = await walk(path);
        if (nested !== undefined) {
          return nested;
        }
      } else if (entry.name === "transcript.txt") {
        return path;
      }
    }
    return undefined;
  }
  const found = await walk(dir);
  if (found === undefined) {
    throw new DependencyError("lark-cli did not write a transcript.txt");
  }
  return (await readFile(found, "utf8")).replace(/\r\n/g, "\n");
}

export class LarkCliClient implements LarkMinutesClient {
  async listMinutes(): Promise<LarkMinuteSummary[]> {
    const { stdout } = runLark([
      "minutes",
      "+search",
      "--as",
      "user",
      "--owner-ids",
      "me",
      "--page-size",
      "15",
      "--format",
      "json",
    ]);
    return extractMinutes(parseJson(stdout)).flatMap((row) => {
      const summary = summaryFromRecord(row);
      return summary === undefined ? [] : [summary];
    });
  }

  async fetchTranscript(token: string): Promise<LarkMinuteTranscript> {
    const dir = await mkdtemp(join(tmpdir(), "kb-lark-"));
    try {
      const { stdout } = runLark([
        "minutes",
        "+detail",
        "--as",
        "user",
        "--minute-tokens",
        token,
        "--transcript",
        "--overwrite",
        "--output-dir",
        dir,
        "--format",
        "json",
      ]);
      const payload = parseJson(stdout);
      const rows = extractMinutes(payload);
      const record = rows[0] ?? asRecord(payload) ?? {};
      const summary = summaryFromRecord(record) ?? {
        token,
        title: token,
        occurredAt: null,
        url: null,
      };
      let occurredAt = summary.occurredAt;
      let title = summary.title;
      let url = summary.url;
      if (occurredAt === null) {
        try {
          const meta = runLark([
            "minutes",
            "minutes",
            "get",
            "--minute-token",
            token,
            "--as",
            "user",
            "--format",
            "json",
          ]);
          const metaRecord = asRecord(parseJson(meta.stdout)) ?? {};
          const nested = asRecord(metaRecord.minute) ?? {};
          occurredAt =
            parseTime(metaRecord.start_time) ??
            parseTime(metaRecord.create_time) ??
            parseTime(nested.start_time) ??
            parseTime(nested.create_time);
          title = asString(metaRecord.title) ?? asString(nested.title) ?? title;
          url = asString(metaRecord.url) ?? asString(nested.url) ?? url;
        } catch {
          // Transcript is enough to ingest; occurred_at stays null if metadata lookup fails.
        }
      }
      const artifacts = asRecord(record.artifacts);
      const hinted = asString(artifacts?.transcript_file);
      const transcript = await readTranscriptFile(dir, hinted);
      if (transcript.trim().length === 0) {
        throw new DependencyError(`empty transcript for minute ${token}`);
      }
      return { token, title, occurredAt, url, transcript };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export function createAuthFailClient(message: string): LarkMinutesClient {
  return {
    async listMinutes(): Promise<LarkMinuteSummary[]> {
      throw new DependencyError(message);
    },
    async fetchTranscript(): Promise<LarkMinuteTranscript> {
      throw new DependencyError(message);
    },
  };
}
