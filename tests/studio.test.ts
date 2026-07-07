import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFilm, generateTrailer } from "../src/lib/studio";

const base = {
  id: "pitch_123",
  title: "The Last Render",
  logline: "A render farm gains sentience hours before deletion.",
  genre: "Sci-Fi",
  prompt: "A melancholy sci-fi about a sentient render farm. Cold blue light, obsolescence, memory.",
};

test("generateFilm is deterministic for the same seed", () => {
  const a = generateFilm(base);
  const b = generateFilm(base);
  assert.deepEqual(a, b);
});

test("different prompts produce different films", () => {
  const a = generateFilm(base);
  const b = generateFilm({ ...base, prompt: base.prompt + " But also a comedy about ferrets." });
  assert.notDeepEqual(a.scenes, b.scenes);
});

test("produces a coherent 3-act structure", () => {
  const f = generateFilm(base);
  assert.ok(f.scenes.length >= 6 && f.scenes.length <= 9, "6–9 scenes");
  const acts = new Set(f.scenes.map((s) => s.act));
  assert.deepEqual([...acts].sort(), [1, 2, 3], "all three acts present");
  // acts are non-decreasing across the film
  for (let i = 1; i < f.scenes.length; i++) {
    assert.ok(f.scenes[i].act >= f.scenes[i - 1].act, "acts never go backwards");
  }
});

test("runtime equals the sum of scene durations", () => {
  const f = generateFilm(base);
  const sum = f.scenes.reduce((s, sc) => s + sc.durationSec, 0);
  assert.equal(f.runtimeSec, sum);
});

test("every scene has a palette, tone, caption, and shot", () => {
  const f = generateFilm(base);
  for (const s of f.scenes) {
    assert.match(s.palette.from, /^#[0-9a-f]{6}$/i);
    assert.match(s.palette.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(s.tone >= 0 && s.tone <= 1, "tone in [0,1]");
    assert.ok(s.caption.length > 0);
    assert.ok(s.shot.length > 0);
  }
});

test("generates cast, crew, rating and a critic score", () => {
  const f = generateFilm(base);
  assert.ok(f.cast.length >= 3, "at least 3 cast members");
  assert.ok(f.crew.cinematographer && f.crew.composer && f.crew.editor && f.crew.studio);
  assert.ok(["G", "PG", "PG-13", "R"].includes(f.rating));
  assert.ok(f.criticScore >= 0 && f.criticScore <= 100);
});

test("generateTrailer is deterministic and short", () => {
  const a = generateTrailer(base, 3);
  const b = generateTrailer(base, 3);
  assert.deepEqual(a, b);
  assert.equal(a.scenes.length, 3);
  assert.ok(a.tagline.length > 0);
});

test("a trailer differs from the full film for the same pitch", () => {
  const film = generateFilm(base);
  const trailer = generateTrailer(base, 3);
  // Distinct seed salt -> the teaser is its own cut, not the first N film scenes.
  assert.notDeepEqual(trailer.scenes, film.scenes.slice(0, 3));
});

test("poster is well-formed self-contained SVG and escapes the title", () => {
  const f = generateFilm({ ...base, title: 'Tom & "Jerry" <hacked>' });
  assert.ok(f.posterSvg.startsWith("<svg"));
  assert.ok(f.posterSvg.trim().endsWith("</svg>"));
  assert.ok(!f.posterSvg.includes("<hacked>"), "raw markup must be escaped");
  assert.ok(f.posterSvg.includes("&amp;"));
});
