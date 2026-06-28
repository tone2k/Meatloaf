import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ValidationError,
  parseHandle,
  parsePitch,
  parseTicketPrice,
  parseTipAmount,
} from "../src/lib/validation";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

test("parseHandle normalizes and strips invalid characters", () => {
  assert.equal(parseHandle("  Ava Renner!! "), "avarenner");
  assert.equal(parseHandle("Studio_Ghost"), "studio_ghost");
});

test("parseHandle rejects too-short handles", () => {
  assert.throws(() => parseHandle("a"), ValidationError);
  assert.throws(() => parseHandle("!!!"), ValidationError);
});

test("parsePitch accepts a valid pitch and falls back to a safe genre", () => {
  const p = parsePitch(
    fd({
      title: "The Last Render",
      logline: "A render farm gains sentience hours before deletion.",
      prompt: "A melancholy sci-fi about a sentient render farm and obsolescence.",
      genre: "NotARealGenre",
    })
  );
  assert.equal(p.title, "The Last Render");
  assert.equal(p.genre, "Drama");
});

test("parsePitch enforces minimum lengths", () => {
  assert.throws(
    () => parsePitch(fd({ title: "x", logline: "short", prompt: "tiny", genre: "Drama" })),
    ValidationError
  );
});

test("parseTicketPrice clamps to allowed bounds", () => {
  assert.equal(parseTicketPrice(fd({ ticketPrice: "7" })), 7);
  assert.throws(() => parseTicketPrice(fd({ ticketPrice: "9999" })), ValidationError);
  assert.throws(() => parseTicketPrice(fd({ ticketPrice: "-1" })), ValidationError);
  assert.throws(() => parseTicketPrice(fd({ ticketPrice: "abc" })), ValidationError);
});

test("parseTipAmount requires a positive, bounded integer", () => {
  assert.equal(parseTipAmount(fd({ amount: "10" })), 10);
  assert.throws(() => parseTipAmount(fd({ amount: "0" })), ValidationError);
  assert.throws(() => parseTipAmount(fd({ amount: "100000" })), ValidationError);
});
