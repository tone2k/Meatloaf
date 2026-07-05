import { test } from "node:test";
import assert from "node:assert/strict";
import { plural, runtime } from "../src/lib/format";

test("plural uses the singular form for exactly one", () => {
  assert.equal(plural(1, "ticket"), "1 ticket");
  assert.equal(plural(1, "film"), "1 film");
});

test("plural uses the plural form otherwise", () => {
  assert.equal(plural(0, "ticket"), "0 tickets");
  assert.equal(plural(3, "ticket"), "3 tickets");
});

test("plural supports irregular plurals", () => {
  assert.equal(plural(2, "person", "people"), "2 people");
  assert.equal(plural(1, "person", "people"), "1 person");
});

test("runtime formats minutes and seconds", () => {
  assert.equal(runtime(100), "1m 40s");
  assert.equal(runtime(45), "45s");
});
