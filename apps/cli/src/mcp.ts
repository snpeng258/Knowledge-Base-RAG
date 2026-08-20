import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DependencyError, NotFoundError } from "@summer-sum/core";
import { z } from "zod";
import { formatGetJson, formatSearchJson } from "./format.ts";
import { getKnowledge, listKnowledgeTags, loadFacadeConfig, searchKnowledge, type FacadeConfig } from "./read.ts";

export const MCP_READ_TOOLS = ["tags", "search", "get"] as const;

const TAGS_DESCRIPTION =
  "Step 1 of 3: list the controlled tag vocabulary (slug, name, description). Call this first to learn filter dimensions. Then call search for cards (no full text). Then call get with an id from search to fetch the document body. This tool never mutates the knowledge base.";

const SEARCH_DESCRIPTION =
  "Step 2 of 3: search the knowledge base and return document cards only (id, title, description, tags, hit snippets). Never returns full document content — use get after you pick an id. Optional tags/kind/since/until/limit match the CLI. Empty results mean nothing matched, not an error.";

const GET_DESCRIPTION =
  "Step 3 of 3: fetch one document's full text by id from a previous search card. Do not guess ids. A missing id is an error, not an empty document. Call tags then search first when exploring.";

export type McpToolResult = {
  isError: boolean;
  text: string;
};

export async function invokeMcpReadTool(
  name: string,
  args: Record<string, unknown>,
  cfg: FacadeConfig = loadFacadeConfig(),
): Promise<McpToolResult> {
  try {
    if (name === "tags") {
      return ok(await listKnowledgeTags(cfg));
    }
    if (name === "search") {
      const query = requiredString(args.query, "query");
      const input: { query: string; tags?: string[]; kind?: string; since?: Date; until?: Date; limit?: number } = {
        query,
      };
      const tags = stringArray(args.tags);
      if (tags !== undefined) {
        input.tags = tags;
      }
      const kind = optionalString(args.kind);
      if (kind !== undefined) {
        input.kind = kind;
      }
      const since = optionalDate(args.since, "since");
      if (since !== undefined) {
        input.since = since;
      }
      const until = optionalDate(args.until, "until");
      if (until !== undefined) {
        input.until = until;
      }
      const limit = optionalPositiveInt(args.limit);
      if (limit !== undefined) {
        input.limit = limit;
      }
      return ok(formatSearchJson(await searchKnowledge(input, cfg)));
    }
    if (name === "get") {
      const id = requiredString(args.id, "id");
      return ok(formatGetJson(await getKnowledge(id, cfg)));
    }
    return { isError: true, text: `unknown tool: ${name}` };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof DependencyError) {
      return { isError: true, text: error.message };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, text: message };
  }
}

export function createKbMcpServer(cfg: FacadeConfig = loadFacadeConfig()): McpServer {
  const server = new McpServer({ name: "kb", version: "0.0.0" });
  server.registerTool(
    "tags",
    { title: "List tags", description: TAGS_DESCRIPTION, inputSchema: {} },
    async () => toCallResult(await invokeMcpReadTool("tags", {}, cfg)),
  );
  server.registerTool(
    "search",
    {
      title: "Search cards",
      description: SEARCH_DESCRIPTION,
      inputSchema: {
        query: z.string().describe("Search query, same as `kb search`"),
        tags: z.array(z.string()).optional().describe("Tag slugs to require, same as repeated --tag"),
        kind: z.string().optional().describe("Document kind filter"),
        since: z.string().optional().describe("Inclusive occurred_at lower bound (ISO date)"),
        until: z.string().optional().describe("Inclusive occurred_at upper bound (ISO date)"),
        limit: z.number().int().positive().optional().describe("Max cards, default 10"),
      },
    },
    async (args) => toCallResult(await invokeMcpReadTool("search", args as Record<string, unknown>, cfg)),
  );
  server.registerTool(
    "get",
    {
      title: "Get document",
      description: GET_DESCRIPTION,
      inputSchema: {
        id: z.string().describe("Document id from a search card"),
      },
    },
    async (args) => toCallResult(await invokeMcpReadTool("get", args as Record<string, unknown>, cfg)),
  );
  return server;
}

export async function startMcpStdio(cfg: FacadeConfig = loadFacadeConfig()): Promise<void> {
  const server = createKbMcpServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await waitUntilStdinCloses();
  await server.close();
}

export function waitUntilStdinCloses(): Promise<void> {
  if (process.stdin.readableEnded) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => resolve();
    process.stdin.once("end", done);
    process.stdin.once("close", done);
  });
}

function ok(payload: unknown): McpToolResult {
  return { isError: false, text: JSON.stringify(payload) };
}

function toCallResult(result: McpToolResult): { isError?: boolean; content: { type: "text"; text: string }[] } {
  return {
    ...(result.isError ? { isError: true } : {}),
    content: [{ type: "text", text: result.text }],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("expected a string");
  }
  return value;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("tags must be an array of strings");
  }
  return value;
}

function optionalDate(value: unknown, field: string): Date | undefined {
  const raw = optionalString(value);
  if (raw === undefined) {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} is not a valid date: ${raw}`);
  }
  return date;
}

function optionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("limit must be a positive integer");
  }
  return value;
}
