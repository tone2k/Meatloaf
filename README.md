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
   credits. The board ranks pitches by votes.
3. **Greenlight** — at **5 votes** a pitch auto-greenlights. Voting closes and the
   author is now the director/producer of record.
4. **Generate** — the director rolls camera. The **studio engine** turns the prompt
   into a screenplay: scenes (each with its own palette, camera direction, action
   beat, and dialogue), a procedurally rendered poster, and a runtime.
5. **Stream & Monetize** — the film streams scene-by-scene in the player. Viewers
   buy a ticket (credits) or tip; revenue is split between the director and the
   platform. The director sets their own ticket price.

## Stack

- **Next.js 15** (App Router, React 19, Server Actions) — full-stack, one app.
- **Prisma + SQLite** — type-safe data layer, zero external services.
- **Hand-written CSS** — no UI framework, no build-time native binaries.
- **The studio engine** (`src/lib/studio.ts`) — a deterministic, seeded generator
  that needs **no API key**. It produces `Scene[]`, an SVG poster, and a runtime.
  That output shape is the contract a real text-to-video backend would fulfil;
  only this one implementation would be swapped to plug a real model in.

## Run it

```bash
npm install              # installs deps (postinstall is skipped if offline)
npm run setup            # prisma generate + db push + seed demo data
npm run dev              # http://localhost:3000
```

If `npm install` can't run Prisma's engine postinstall (e.g. restricted network),
install with `npm install --ignore-scripts`, then `npm run setup`.

### Useful scripts

| Script            | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Start the dev server                          |
| `npm run build`   | `prisma generate` + production build          |
| `npm run setup`   | Generate client, create DB, seed demo data    |
| `npm run db:reset`| Wipe and re-seed the database                 |
| `npm run db:seed` | Re-seed demo users, pitches, and one released film |
| `npm run typecheck`| `tsc --noEmit`                               |

The seed creates 6 users, 5 pitches across the pipeline (one already greenlit and
**released** so there's a film streaming on first load), and a starting wallet for
everyone.

## How the pieces fit

| Path                         | Responsibility                                            |
| ---------------------------- | --------------------------------------------------------- |
| `prisma/schema.prisma`       | Users, Pitches, Votes, Movies, Views, Tips, Transactions  |
| `src/lib/config.ts`          | The tunable rules (threshold, fees, prices)               |
| `src/lib/studio.ts`          | The generative engine (prompt → film)                     |
| `src/lib/economy.ts`         | Wallet ledger + revenue split                             |
| `src/lib/session.ts`         | Handle-based identity (cookie session)                    |
| `src/app/actions.ts`         | All mutations as Server Actions                           |
| `src/app/page.tsx`           | The board (in development / production / streaming)       |
| `src/app/pitch/[id]`         | Pitch detail, voting, director's "roll camera"            |
| `src/app/watch/[id]`         | The player, paywall, tipping, director controls           |
| `src/app/studio`             | Director dashboard: films, earnings, wallet ledger        |
| `src/components/Player.tsx`  | Scene-by-scene "stream" playback                          |

## Tuning the economy

Everything balance-related lives in `src/lib/config.ts`:

```ts
GREENLIGHT_THRESHOLD: 5    // votes to greenlight
STARTING_CREDITS:    100   // wallet grant on sign-up
PLATFORM_FEE:        0.1   // platform's cut of each ticket/tip
DEFAULT_TICKET_PRICE: 5    // director can change this per film
```
