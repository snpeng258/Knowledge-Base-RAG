# MCP server

> Created: 2026-08-21
> Status: active

`kb mcp` starts a stdio MCP server that exposes **read** tools only. Write/ingest tools are intentionally absent.

Use **node**, not `pnpm kb mcp`. `pnpm` prints extra text on stdout and breaks JSON-RPC.

## Tools (call in this order)

1. `tags` — controlled vocabulary
2. `search` — document cards (never full text)
3. `get` — full text for one `id` from search

Same JSON shapes as `kb tags --json`, `kb search --json`, `kb get --json`. See [cli-surface.md](../specs/cli-surface.md) §3.3 and §3.4.

## Cursor

In `.cursor/mcp.json` (or Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "<repo-root>/apps/cli/src/index.ts",
        "mcp"
      ],
      "env": {
        "KB_DATABASE_URL": "postgresql://kb:kb@127.0.0.1:5432/kb"
      }
    }
  }
}
```

Replace the path with this clone's absolute `<repo-root>`. Optional: `KB_TEI_URL`, `KB_RERANK_ENABLED`.

## Claude Code

In `.mcp.json` at the project root (or Claude Code's MCP settings):

```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "./apps/cli/src/index.ts",
        "mcp"
      ],
      "env": {
        "KB_DATABASE_URL": "postgresql://kb:kb@127.0.0.1:5432/kb"
      }
    }
  }
}
```

Run from the repository root so the relative path resolves. Postgres must already be up (`docker compose up -d`).
