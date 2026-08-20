import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PACKAGE_NAME } from "./index.ts";

test("core package identity is stable", () => {
  assert.equal(PACKAGE_NAME, "@summer-sum/core");
});

test("core sources do not import the CLI package", async () => {
  const srcRoot = fileURLToPath(new URL("./", import.meta.url));
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (extname(entry.name) === ".ts") {
        files.push(path);
      }
    }
  }
  await walk(srcRoot);
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /@summer-sum\/cli/);
  }
});
