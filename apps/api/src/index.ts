import { databaseUrl, loadEnvFiles, repoRootFrom } from "@summer-sum/core";
import { createApiServer } from "./server.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

const token = process.env.KB_API_TOKEN ?? "";
if (token.length === 0) {
  process.stderr.write("KB_API_TOKEN is not set\n");
  process.exit(3);
}

const host = process.env.KB_API_HOST ?? "127.0.0.1";
const port = Number(process.env.KB_API_PORT ?? "8787");
const server = createApiServer({
  databaseUrl: databaseUrl(),
  teiUrl: process.env.KB_TEI_URL ?? "http://localhost:8080",
  token,
});
server.listen(port, host, () => {
  process.stderr.write(`kb api listening on http://${host}:${port}\n`);
});
