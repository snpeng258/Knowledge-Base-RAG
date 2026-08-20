import assert from "node:assert/strict";
import { test } from "node:test";
import { extractMinutes, isLarkAuthFailure, parseTime } from "./parse.ts";

test("parseTime accepts millisecond strings from lark-cli", () => {
  const date = parseTime("1669098360477");
  assert.ok(date !== null);
  assert.equal(date.getTime(), 1669098360477);
  assert.equal(parseTime("2026-08-12T10:00:00+08:00")?.toISOString(), "2026-08-12T02:00:00.000Z");
});

test("extractMinutes reads search items and detail minutes arrays", () => {
  const fromSearch = extractMinutes({ items: [{ minute_token: "obcn1", title: "a" }] });
  assert.equal(fromSearch[0]?.minute_token, "obcn1");
  const fromDetail = extractMinutes({ minutes: [{ minute_token: "obcn2", title: "b" }] });
  assert.equal(fromDetail[0]?.minute_token, "obcn2");
});

test("auth failure is not inferred from successful JSON containing 401", () => {
  const success = JSON.stringify({ duration: "314000", token: "abc401def" });
  assert.equal(isLarkAuthFailure(0, success), false);
  assert.equal(isLarkAuthFailure(3, '{"error":{"type":"authorization","subtype":"missing_scope"}}'), true);
});
