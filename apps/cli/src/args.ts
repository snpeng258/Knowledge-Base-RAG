import { usage } from "./exit.ts";

export type CliArgs = {
  json: boolean;
  remote: boolean;
  positional: string[];
  tags: string[];
  kind: string | undefined;
  since: string | undefined;
  until: string | undefined;
  limit: number | undefined;
  databaseUrl: string | undefined;
  teiUrl: string | undefined;
  ollamaUrl: string | undefined;
  latest: boolean;
};

function takeValue(argv: string[], index: number, flag: string): { value: string; next: number } {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    usage(`usage: ${flag} <value>`);
  }
  return { value, next: index + 1 };
}

export function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  const tags: string[] = [];
  let json = false;
  let remote = false;
  let kind: string | undefined;
  let since: string | undefined;
  let until: string | undefined;
  let limit: number | undefined;
  let databaseUrl: string | undefined;
  let teiUrl: string | undefined;
  let ollamaUrl: string | undefined;
  let latest = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      break;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--latest") {
      latest = true;
      continue;
    }
    if (arg === "--remote") {
      remote = true;
      continue;
    }
    if (arg === "--tag") {
      const taken = takeValue(argv, i, "--tag");
      tags.push(taken.value);
      i = taken.next;
      continue;
    }
    if (arg === "--kind") {
      const taken = takeValue(argv, i, "--kind");
      kind = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--since") {
      const taken = takeValue(argv, i, "--since");
      since = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--until") {
      const taken = takeValue(argv, i, "--until");
      until = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--limit") {
      const taken = takeValue(argv, i, "--limit");
      const parsed = Number(taken.value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        usage("usage: --limit <positive integer>");
      }
      limit = parsed;
      i = taken.next;
      continue;
    }
    if (arg === "--database-url") {
      const taken = takeValue(argv, i, "--database-url");
      databaseUrl = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--tei-url") {
      const taken = takeValue(argv, i, "--tei-url");
      teiUrl = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--ollama-url") {
      const taken = takeValue(argv, i, "--ollama-url");
      ollamaUrl = taken.value;
      i = taken.next;
      continue;
    }
    if (arg.startsWith("--")) {
      usage(`unknown flag: ${arg}`);
    }
    positional.push(arg);
  }

  return { json, remote, positional, tags, kind, since, until, limit, databaseUrl, teiUrl, ollamaUrl, latest };
}

export function parseDateFlag(raw: string, flag: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    usage(`${flag} is not a valid date: ${raw}`);
  }
  return date;
}
