/**
 * The Studio Engine.
 *
 * Turns a greenlit pitch into a streamable "film": a tagline, synopsis, a set
 * of scenes (each with its own palette + shot + dialogue), an inline SVG poster,
 * and a runtime.
 *
 * It is fully deterministic — seeded from the pitch — so the same prompt always
 * renders the same film, and it needs no external API to run. The shape of the
 * output (Scene[], poster, runtime) is the contract a real video-gen backend
 * would later fulfill; only this implementation would be swapped.
 */

export interface Scene {
  index: number;
  heading: string; // e.g. "INT. DERELICT STATION — NIGHT"
  shot: string; // camera / framing direction
  action: string; // what happens
  dialogue: { speaker: string; line: string } | null;
  palette: { from: string; to: string; accent: string };
  durationSec: number;
}

export interface FilmArtifacts {
  tagline: string;
  synopsis: string;
  scenes: Scene[];
  posterSvg: string;
  runtimeSec: number;
}

// --- deterministic PRNG (mulberry32) seeded from a string ----------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// --- creative banks ------------------------------------------------------------

const PALETTES = [
  { from: "#0f172a", to: "#1e3a8a", accent: "#38bdf8" }, // cold blue
  { from: "#1a0f0f", to: "#7f1d1d", accent: "#f97316" }, // ember
  { from: "#0c0a1d", to: "#4c1d95", accent: "#e879f9" }, // neon violet
  { from: "#05140f", to: "#064e3b", accent: "#34d399" }, // toxic green
  { from: "#1c1917", to: "#44403c", accent: "#fbbf24" }, // amber dust
  { from: "#111827", to: "#374151", accent: "#f43f5e" }, // gunmetal
  { from: "#13111c", to: "#312e81", accent: "#a5b4fc" }, // midnight indigo
];

const LOCATIONS = [
  "a derelict orbital station",
  "the last lit diner on Route 9",
  "a flooded subway platform",
  "the glass spire of NeoCity",
  "an abandoned film set",
  "the back room of a pawn shop",
  "a research outpost under the ice",
  "the rooftop gardens of the Arcology",
  "a fog-drowned harbor",
  "the server vault beneath the cathedral",
];

const TIMES = ["NIGHT", "DAWN", "DUSK", "CONTINUOUS", "LATER", "MAGIC HOUR"];

const SHOTS = [
  "Slow push-in on the protagonist's face.",
  "Wide establishing drone shot, the world dwarfs them.",
  "Handheld, breathless, chasing the action.",
  "Locked-off symmetrical frame, unsettlingly still.",
  "Dutch angle as the ground tilts beneath them.",
  "Macro on trembling hands, the rest soft-focus.",
  "Long unbroken tracking shot through the crowd.",
  "Reflection in cracked glass, two worlds overlap.",
];

const SPEAKERS = ["NOVA", "CASS", "THE WARDEN", "DR. IVES", "RILEY", "VOICE", "ECHO", "MARLOW"];

const BEATS = [
  "An ordinary moment fractures — something is deeply wrong.",
  "The protagonist discovers a clue that rewrites everything.",
  "An ally reveals a cost no one wanted to name.",
  "The plan goes loud; nothing survives contact with reality.",
  "A quiet confession changes the stakes entirely.",
  "The antagonist's true design snaps into focus.",
  "Everything the hero built is taken from them.",
  "A last, impossible choice — and they make it.",
];

const DIALOGUE = [
  "We were never supposed to find this.",
  "Whatever happens next, it was worth it.",
  "You don't get to decide what I'm willing to lose.",
  "The signal's not random. It's a name.",
  "I've seen how this ends. I'm doing it anyway.",
  "There's no version of this where we both walk away.",
  "Tell them I tried.",
  "Run. Don't look back. Promise me.",
];

const TAGLINES = [
  "Some stories generate themselves.",
  "Every frame, a consequence.",
  "The future was always going to look like this.",
  "Greenlit by the crowd. Forged by the machine.",
  "Nothing here is real. Everything here is true.",
  "A film the algorithm dreamed and the people chose.",
];

// --- generation ----------------------------------------------------------------

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract a few evocative keywords from the prompt to seed the synopsis. */
function keywords(prompt: string): string[] {
  const stop = new Set([
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "with",
    "for", "is", "are", "that", "this", "it", "as", "by", "from", "about",
    "movie", "film", "story", "about",
  ]);
  return Array.from(
    new Set(
      prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stop.has(w))
    )
  ).slice(0, 6);
}

export function generateFilm(input: {
  id: string;
  title: string;
  logline: string;
  genre: string;
  prompt: string;
}): FilmArtifacts {
  const rng = mulberry32(hashString(input.id + "::" + input.prompt));
  const kw = keywords(input.prompt + " " + input.logline);

  const sceneCount = 5 + Math.floor(rng() * 3); // 5–7 scenes
  const scenes: Scene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const palette = pick(rng, PALETTES);
    const location = pick(rng, LOCATIONS);
    const time = pick(rng, TIMES);
    const prefix = rng() > 0.5 ? "INT." : "EXT.";
    const hasDialogue = rng() > 0.35;
    scenes.push({
      index: i,
      heading: `${prefix} ${location.replace(/^(a|an|the) /, "").toUpperCase()} — ${time}`,
      shot: pick(rng, SHOTS),
      action: BEATS[Math.min(i, BEATS.length - 1)],
      dialogue: hasDialogue
        ? { speaker: pick(rng, SPEAKERS), line: pick(rng, DIALOGUE) }
        : null,
      palette,
      durationSec: 8 + Math.floor(rng() * 7), // 8–14s per scene
    });
  }

  const runtimeSec = scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const tagline = pick(rng, TAGLINES);

  const kwPhrase =
    kw.length >= 2
      ? `${kw[0]} and ${kw[1]}`
      : kw[0] ?? "an unraveling world";
  const synopsis =
    `A ${input.genre.toLowerCase()} forged from a single prompt. ` +
    `Drawn into a world of ${kwPhrase}, the protagonist must move through ${sceneCount} ` +
    `escalating sequences before the story collapses toward its only possible ending. ` +
    `${input.logline}`;

  const posterSvg = renderPoster({
    title: input.title,
    genre: input.genre,
    palette: scenes[0].palette,
    rng,
  });

  return { tagline, synopsis, scenes, posterSvg, runtimeSec };
}

// --- procedural SVG poster -----------------------------------------------------

function renderPoster(opts: {
  title: string;
  genre: string;
  palette: { from: string; to: string; accent: string };
  rng: () => number;
}): string {
  const { title, genre, palette, rng } = opts;
  const w = 600;
  const h = 900;

  // A scatter of "starfield"/grain dots for texture.
  let dots = "";
  for (let i = 0; i < 90; i++) {
    const cx = Math.floor(rng() * w);
    const cy = Math.floor(rng() * h);
    const r = rng() * 1.6 + 0.3;
    const o = (rng() * 0.5 + 0.1).toFixed(2);
    dots += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="#fff" opacity="${o}"/>`;
  }

  // A few abstract "horizon" bands.
  const band1 = Math.floor(h * (0.55 + rng() * 0.1));
  const band2 = Math.floor(h * (0.7 + rng() * 0.1));

  const safeTitle = title.length > 26 ? title.slice(0, 25) + "…" : title;
  const titleSize = safeTitle.length > 16 ? 52 : 66;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeXml(title)} poster">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="60%">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${dots}
  <circle cx="${w / 2}" cy="${h * 0.36}" r="120" fill="none" stroke="${palette.accent}" stroke-width="2" opacity="0.7"/>
  <circle cx="${w / 2}" cy="${h * 0.36}" r="150" fill="none" stroke="${palette.accent}" stroke-width="1" opacity="0.35"/>
  <rect x="0" y="${band1}" width="${w}" height="3" fill="${palette.accent}" opacity="0.5"/>
  <rect x="0" y="${band2}" width="${w}" height="6" fill="${palette.accent}" opacity="0.25"/>
  <text x="${w / 2}" y="${h * 0.78}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="700" fill="#ffffff" letter-spacing="1">${escapeXml(safeTitle.toUpperCase())}</text>
  <text x="${w / 2}" y="${h * 0.84}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="${palette.accent}" letter-spacing="6">${escapeXml(genre.toUpperCase())}</text>
  <text x="${w / 2}" y="${h * 0.95}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#ffffff" opacity="0.6" letter-spacing="3">A GREENLIGHT STUDIO PRODUCTION</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
