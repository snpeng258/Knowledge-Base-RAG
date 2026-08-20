import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./run.ts";

async function main(): Promise<void> {
  const code = await runCli(process.argv.slice(2));
  process.exit(code);
}

const isDirectRun =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  await main();
}
