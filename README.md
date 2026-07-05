# 🎬 Greenlight — a generative AI movie studio

**Pitch a movie. The crowd votes. The best pitch gets made.**

Greenlight turns moviemaking into a public greenlight process. Anyone can pitch a
film as a single generative prompt. The community votes on the board. When a pitch
crosses the vote threshold it's **greenlit** — its author is granted **director &
producer rights**, the studio engine generates the film, and it goes up to stream
for credits that flow back to the director.

```
Pitch  ──▶  Vote  ──▶  Greenlight  ──▶  Generate  ──▶  Stream & Monetize
 (prompt)   (crowd)    (author becomes   (studio        (tickets + tips →
                        director)         engine)         director's wallet)
```

## The loop in detail

1. **Pitch** — sign in with any handle, submit a title, logline, genre, and the
   generative prompt that defines the film's world.
2. **Vote** — every account gets one vote per pitch and starts with `100` studio
   credits. Voting is **optimistic** — the count moves the instant you click.
3. **Greenlight** — at **5 votes** a pitch auto-greenlights. A celebration fires,
   voting closes, and the author is now the director/producer of record.
4. **Generate** — the director rolls camera. The **studio engine** turns the prompt
   into a film: a 3-act screenplay (scenes with palette, camera, action, and
   dialogue), a generated **cast & crew**, an MPAA-style rating, a critic score, a
   procedurally rendered SVG poster, and a runtime.
5. **Stream & Monetize** — the film plays in a **cinematic player** — opening
   titles, captions, a **live procedural score** (synthesized in the browser, no
   audio files), and an end-credits roll. Viewers buy a ticket (credits) or tip;
   revenue is split between the director and the platform. The director sets their
   own ticket price. The **Box Office** ranks top films and directors.

## What makes it demo-ready

- 🎥 **Cinematic player** — title card → captioned scenes with ken-burns drift →
  rolling end credits, with a procedurally synthesized ambient **score** (Web
  Audio, zero assets) and keyboard controls (`space`, `←/→`, `m`).
- 🟢 **The greenlight moment** — crossing the vote threshold triggers a confetti
  celebration and instantly confers director rights.
- 🍿 **Box Office leaderboard** — top-grossing films and top-earning directors.
- 🔎 **Board** — hot / new / top sorting, genre filter, and live search.
- 💸 **Real economy** — wallets, a transaction ledger, ticket/tip revenue splits
  with a platform fee, all inside DB transactions.
- 🛡️ **Production hardening** — typed `ActionResult`s, input validation, graceful
  error / loading / not-found boundaries, toasts for every action, a unit-test
  suite, and CI.

## Stack

- **Next.js 15** (App Router, React 19, Server Actions) — full-stack, one app.
- **Prisma + SQLite** — type-safe data layer, zero external services.
- **Hand-written CSS** — no UI framework, no build-time native binaries.
- **Zero runtime dependencies beyond the framework** — the studio engine, the
  audio score, validation, and tests are all dependency-free.
- **The studio engine** (`src/lib/studio.ts`) is a deterministic, seeded generator
  that needs **no API key**. It produces `Scene[]`, cast/crew, a poster, and a
  runtime. That output shape is the contract a real text-to-video backend would
  later fulfil; only this one implementation would be swapped to plug a real model
  in.

## Run it

```bash
npm install              # installs deps (postinstall is skipped if offline)
npm run setup            # prisma generate + db push + seed demo data
npm run dev              # http://localhost:3000
```

If `npm install` can't run Prisma's engine postinstall (e.g. restricted network),
install with `npm install --ignore-scripts`, then `npm run setup`. There's also a
best-effort `bash scripts/dev-setup.sh` that does all of the above.

### Scripts

| Script              | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Start the dev server                               |
| `npm run build`     | `prisma generate` + production build               |
| `npm run setup`     | Generate client, create DB, seed demo data         |
| `npm run db:reset`  | Wipe and re-seed the database                      |
| `npm run db:seed`   | Re-seed demo users, pitches, and released films    |
| `npm run typecheck` | `tsc --noEmit`                                      |
| `npm test`          | Unit tests (`node:test` via `tsx`)                 |

The seed creates 8 users, 8 pitches across the pipeline, **3 released films** with
simulated box-office activity (so Streaming and Box Office are populated on first
load), and a starting wallet + ledger for everyone.

## Architecture

| Path                            | Responsibility                                        |
| ------------------------------- | ----------------------------------------------------- |
| `prisma/schema.prisma`          | Users, Pitches, Votes, Movies, Views, Tips, Transactions |
| `src/lib/config.ts`             | Tunable rules (threshold, fees, prices, genres)       |
| `src/lib/studio.ts`             | The generative engine (prompt → film)                 |
| `src/lib/audio.ts`              | The procedural score (Web Audio)                      |
| `src/lib/economy.ts`            | Wallet ledger + revenue split                         |
| `src/lib/validation.ts`         | Dependency-free input validation                      |
| `src/lib/types.ts`              | The `ActionResult` contract                           |
| `src/lib/session.ts`            | Handle-based identity (cookie session)                |
| `src/app/actions.ts`            | All mutations as Server Actions (typed + validated)   |
| `src/app/page.tsx`              | The board (sort / filter / search)                    |
| `src/app/pitch/[id]`            | Pitch detail, voting, director's "roll camera"        |
| `src/app/watch/[id]`            | Player, paywall, tipping, director controls           |
| `src/app/box-office`            | Leaderboard: top films & directors                    |
| `src/app/studio`                | Director dashboard: films, earnings, wallet ledger    |
| `src/components/Player.tsx`     | Cinematic scene-by-scene playback + score             |
| `src/components/Celebration.tsx`| The greenlight confetti moment                        |
| `tests/`                        | Unit tests for the engine, economy, and validation    |

## Tuning the economy

Everything balance-related lives in `src/lib/config.ts`:

```ts
GREENLIGHT_THRESHOLD: 5    // votes to greenlight
STARTING_CREDITS:    100   // wallet grant on sign-up
PLATFORM_FEE:        0.1   // platform's cut of each ticket/tip
DEFAULT_TICKET_PRICE: 5    // director can change this per film
```
