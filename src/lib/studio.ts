/**
 * The Studio Engine.
 *
 * Turns a greenlit pitch into a streamable "film": a refined logline + tagline,
 * a synopsis, a 3-act set of scenes (each with its own palette, camera, action
 * beat, dialogue, subtitle, and an audio "tone"), a generated cast & crew, an
 * MPAA-style rating, a critic score, an inline SVG poster, and a runtime.
 *
 * It is fully deterministic — seeded from the pitch — so the same prompt always
 * renders the same film, and it needs no external API to run. The shape of the
 * output (Scene[], cast, poster, runtime) is the contract a real text-to-video
 * backend would later fulfil; only this implementation would be swapped.
 */

export interface Scene {
  index: number;
  act: 1 | 2 | 3;
  heading: string; // e.g. "INT. DERELICT STATION — NIGHT"
  shot: string; // camera / framing direction
  action: string; // what happens
  caption: string; // on-screen subtitle while the scene plays
  dialogue: { speaker: string; line: string } | null;
  palette: { from: string; to: string; accent: string };
  tone: number; // 0..1 brightness — drives the procedural score
  durationSec: number;
}

export interface CastMember {
  role: string;
  actor: string;
}

export interface Crew {
  cinematographer: string;
  composer: string;
  editor: string;
  studio: string;
}

export interface TrailerArtifacts {
  tagline: string;
  scenes: Scene[];
}

export interface FilmArtifacts {
  logline: string;
  tagline: string;
  synopsis: string;
  scenes: Scene[];
  cast: CastMember[];
  crew: Crew;
  rating: string; // G | PG | PG-13 | R
  criticScore: number; // 0..100
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

function sample<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

// --- creative banks ------------------------------------------------------------

const PALETTES = [
  { from: "#0f172a", to: "#1e3a8a", accent: "#38bdf8", tone: 0.35 }, // cold blue
  { from: "#1a0f0f", to: "#7f1d1d", accent: "#f97316", tone: 0.7 }, // ember
  { from: "#0c0a1d", to: "#4c1d95", accent: "#e879f9", tone: 0.55 }, // neon violet
  { from: "#05140f", to: "#064e3b", accent: "#34d399", tone: 0.45 }, // toxic green
  { from: "#1c1917", to: "#44403c", accent: "#fbbf24", tone: 0.6 }, // amber dust
  { from: "#111827", to: "#374151", accent: "#f43f5e", tone: 0.4 }, // gunmetal
  { from: "#13111c", to: "#312e81", accent: "#a5b4fc", tone: 0.5 }, // midnight indigo
  { from: "#1a1305", to: "#92400e", accent: "#fde68a", tone: 0.75 }, // sunscorched
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
  "a motel at the edge of the salt flats",
  "the overgrown lobby of a dead hotel",
];

const TIMES = ["NIGHT", "DAWN", "DUSK", "CONTINUOUS", "LATER", "MAGIC HOUR", "3:00 AM"];

const SHOTS = [
  "Slow push-in on the protagonist's face.",
  "Wide establishing drone shot — the world dwarfs them.",
  "Handheld, breathless, chasing the action.",
  "Locked-off symmetrical frame, unsettlingly still.",
  "Dutch angle as the ground tilts beneath them.",
  "Macro on trembling hands, the rest soft-focus.",
  "Long unbroken tracking shot through the crowd.",
  "Reflection in cracked glass — two worlds overlap.",
  "Crane up and away as everything falls apart.",
  "Whip-pan to the thing they didn't want to see.",
];

const SPEAKERS = ["NOVA", "CASS", "THE WARDEN", "DR. IVES", "RILEY", "VOICE", "ECHO", "MARLOW", "JUNO", "THE STRANGER"];

// 3-act beat structure: setup → confrontation → resolution.
const ACT_BEATS: Record<1 | 2 | 3, string[]> = {
  1: [
    "An ordinary moment fractures — something is deeply wrong.",
    "The protagonist discovers a clue that rewrites everything.",
    "A door opens that should have stayed shut.",
  ],
  2: [
    "An ally reveals a cost no one wanted to name.",
    "The plan goes loud; nothing survives contact with reality.",
    "The antagonist's true design snaps into focus.",
    "A quiet confession changes the stakes entirely.",
  ],
  3: [
    "Everything the hero built is taken from them.",
    "A last, impossible choice — and they make it.",
    "The dust settles on a world that will never be the same.",
  ],
};

const CAPTIONS = [
  "They said it couldn't happen here.",
  "Every signal leaves a scar.",
  "Some doors only open once.",
  "Nobody was coming to save them.",
  "The machine remembered everything.",
  "It was already too late.",
  "They chose each other anyway.",
  "What's done cannot be rendered again.",
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
  "You built me to forget. I didn't.",
  "Everyone leaves. I just got tired of waiting.",
];

const TAGLINES = [
  "Some stories generate themselves.",
  "Every frame, a consequence.",
  "The future was always going to look like this.",
  "Greenlit by the crowd. Forged by the machine.",
  "Nothing here is real. Everything here is true.",
  "A film the algorithm dreamed and the people chose.",
  "No cameras. No crew. No second takes.",
];

const FIRST_NAMES = [
  "Mara", "Idris", "Lena", "Caspian", "Yuki", "Dax", "Soraya", "Bram", "Noor",
  "Theo", "Imani", "Rafe", "Sloane", "Kai", "Vera", "Aurelio", "Petra", "Joss",
];
const LAST_NAMES = [
  "Vance", "Okafor", "Lindqvist", "Reyes", "Cho", "Mbeki", "Sato", "Delacroix",
  "Hollis", "Amari", "Novak", "Bishop", "Ferro", "Quill", "Ashworth", "Renner",
];
const ROLES = [
  "the Protagonist", "the Rival", "the Mentor", "the Ghost", "the Witness",
  "the Architect", "the Last Operator", "the Voice on the Line",
];
const STUDIOS = [
  "Latent Pictures", "Mulberry & Void", "Greenlight Originals", "Dream Render Co.",
  "Aperture Synthetic", "Nightshade Features",
];

// --- helpers -------------------------------------------------------------------

function name(rng: () => number): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

/** Extract a few evocative keywords from the prompt to seed the synopsis. */
function keywords(prompt: string): string[] {
  const stop = new Set([
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "with",
    "for", "is", "are", "that", "this", "it", "as", "by", "from", "about",
    "movie", "film", "story", "themes", "tone", "into", "their", "they",
  ]);
  return Array.from(
    new Set(
      prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stop.has(w))
    )
  ).slice(0, 8);
}

// --- generation ----------------------------------------------------------------

export function generateFilm(input: {
  id: string;
  title: string;
  logline: string;
  genre: string;
  prompt: string;
}): FilmArtifacts {
  const rng = mulberry32(hashString(input.id + "::" + input.prompt));
  const kw = keywords(input.prompt + " " + input.logline);

  // Distribute 6–9 scenes across 3 acts.
  const sceneCount = 6 + Math.floor(rng() * 4);
  const scenes: Scene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const frac = i / sceneCount;
    const act: 1 | 2 | 3 = frac < 0.3 ? 1 : frac < 0.75 ? 2 : 3;
    const p = pick(rng, PALETTES);
    const location = pick(rng, LOCATIONS);
    const time = pick(rng, TIMES);
    const prefix = rng() > 0.5 ? "INT." : "EXT.";
    const hasDialogue = rng() > 0.3;
    scenes.push({
      index: i,
      act,
      heading: `${prefix} ${location.replace(/^(a|an|the) /, "").toUpperCase()} — ${time}`,
      shot: pick(rng, SHOTS),
      action: pick(rng, ACT_BEATS[act]),
      caption: pick(rng, CAPTIONS),
      dialogue: hasDialogue ? { speaker: pick(rng, SPEAKERS), line: pick(rng, DIALOGUE) } : null,
      palette: { from: p.from, to: p.to, accent: p.accent },
      tone: p.tone,
      durationSec: 7 + Math.floor(rng() * 7), // 7–13s per scene
    });
  }

  const runtimeSec = scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const tagline = pick(rng, TAGLINES);

  const kwPhrase = kw.length >= 2 ? `${kw[0]} and ${kw[1]}` : kw[0] ?? "an unraveling world";
  const logline = input.logline;
  const synopsis =
    `A ${input.genre.toLowerCase()} forged from a single prompt. ` +
    `Drawn into a world of ${kwPhrase}, the protagonist moves through ${sceneCount} ` +
    `escalating sequences across three acts before the story collapses toward its only ` +
    `possible ending. ${input.logline}`;

  const cast: CastMember[] = sample(rng, ROLES, 3 + Math.floor(rng() * 2)).map((role) => ({
    role,
    actor: name(rng),
  }));

  const crew: Crew = {
    cinematographer: name(rng),
    composer: name(rng),
    editor: name(rng),
    studio: pick(rng, STUDIOS),
  };

  const ratings = ["PG", "PG-13", "PG-13", "R"] as const;
  const rating = pick(rng, ratings);
  const criticScore = 62 + Math.floor(rng() * 37); // 62–98, demo-friendly

  const posterSvg = renderPoster({
    title: input.title,
    genre: input.genre,
    palette: scenes[0].palette,
    rng,
  });

  return {
    logline,
    tagline,
    synopsis,
    scenes,
    cast,
    crew,
    rating,
    criticScore,
    posterSvg,
    runtimeSec,
  };
}

// --- teaser trailer ------------------------------------------------------------

const TEASER_CAPTIONS = [
  "This season, the crowd decides.",
  "One prompt. One shot.",
  "From the mind of a single pitch…",
  "The story the algorithm couldn't stop.",
  "Coming soon — if you vote it in.",
];

/**
 * A short, high-energy teaser cut from the same world as the eventual film, but
 * seeded distinctly so it reads as its own thing. Quick scenes, hard cuts, a
 * closing title-style caption. Deterministic.
 */
export function generateTrailer(
  input: { id: string; title: string; logline: string; genre: string; prompt: string },
  sceneCount = 3
): TrailerArtifacts {
  const rng = mulberry32(hashString("trailer::" + input.id + "::" + input.prompt));
  const scenes: Scene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const p = pick(rng, PALETTES);
    const location = pick(rng, LOCATIONS);
    const time = pick(rng, TIMES);
    const prefix = rng() > 0.5 ? "INT." : "EXT.";
    const act: 1 | 2 | 3 = i === 0 ? 1 : i === sceneCount - 1 ? 3 : 2;
    const last = i === sceneCount - 1;
    scenes.push({
      index: i,
      act,
      heading: `${prefix} ${location.replace(/^(a|an|the) /, "").toUpperCase()} — ${time}`,
      shot: pick(rng, SHOTS),
      action: pick(rng, ACT_BEATS[act]),
      caption: last ? TEASER_CAPTIONS[0] : pick(rng, TEASER_CAPTIONS),
      dialogue: !last && rng() > 0.5 ? { speaker: pick(rng, SPEAKERS), line: pick(rng, DIALOGUE) } : null,
      palette: { from: p.from, to: p.to, accent: p.accent },
      tone: p.tone,
      durationSec: 3 + Math.floor(rng() * 2), // 3–4s, fast cuts
    });
  }
  return { tagline: pick(rng, TAGLINES), scenes };
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeXml(title)} poster" preserveAspectRatio="xMidYMid slice">
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
