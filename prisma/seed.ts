import { PrismaClient } from "@prisma/client";
import { RULES } from "../src/lib/config";
import { generateFilm } from "../src/lib/studio";

const db = new PrismaClient();

const USERS = [
  { handle: "ava", displayName: "Ava Renner" },
  { handle: "kojima_jr", displayName: "K. Jr" },
  { handle: "del_toro_fan", displayName: "Marisol" },
  { handle: "indie_pete", displayName: "Pete Vance" },
  { handle: "nova", displayName: "Nova Okafor" },
  { handle: "studio_ghost", displayName: "Ghost" },
];

const PITCHES = [
  {
    by: "ava",
    title: "The Last Render",
    genre: "Sci-Fi",
    logline:
      "A render farm gains sentience hours before it's scheduled for deletion, and bargains for its life with the one animator who still believes in it.",
    prompt:
      "A melancholy sci-fi about a sentient render farm in an abandoned VFX house. Cold blue server light, flickering monitors, a lonely animator. Themes of obsolescence, memory, and what it means to finish a story.",
    seedVotes: 6, // greenlit
  },
  {
    by: "del_toro_fan",
    title: "Saltwater Saints",
    genre: "Horror",
    logline:
      "In a drowning harbor town, the tide brings back everyone who was ever lost at sea — and they remember exactly who let them go.",
    prompt:
      "Coastal folk-horror. Fog-drowned harbor, bioluminescent water, a town that made a bargain with the sea. Dread, guilt, beautiful and terrible. The dead return at high tide.",
    seedVotes: 4,
  },
  {
    by: "indie_pete",
    title: "Closing Shift",
    genre: "Drama",
    logline:
      "Two strangers work the last night of a 24-hour diner before it's demolished, trading the secrets they could never tell anyone who'd remember.",
    prompt:
      "Quiet two-hander drama set entirely in a diner on its final night. Warm amber light, rain on glass, long takes. Loneliness, second chances, the things we confess to strangers.",
    seedVotes: 3,
  },
  {
    by: "nova",
    title: "Patch Notes",
    genre: "Comedy",
    logline:
      "A burnt-out game studio discovers their abandoned NPC has been live-streaming their office gossip to two million viewers.",
    prompt:
      "Workplace comedy in a chaotic indie game studio. Bright, fast, absurd. An NPC that became self-aware and won't stop narrating. Office politics, deadlines, accidental fame.",
    seedVotes: 2,
  },
  {
    by: "kojima_jr",
    title: "Vault of the Cathedral",
    genre: "Thriller",
    logline:
      "A data-archaeologist breaks into the server vault beneath a cathedral to delete a single file — the one proving she was ever there.",
    prompt:
      "Tense techno-thriller. Server vault beneath a gothic cathedral, candlelight on cold steel, a heist of pure information. Paranoia, surveillance, a ticking clock.",
    seedVotes: 1,
  },
];

async function main() {
  console.log("Resetting…");
  // Order matters for FK constraints.
  await db.transaction.deleteMany();
  await db.tip.deleteMany();
  await db.view.deleteMany();
  await db.vote.deleteMany();
  await db.movie.deleteMany();
  await db.pitch.deleteMany();
  await db.user.deleteMany();

  const users: Record<string, { id: string }> = {};
  for (const u of USERS) {
    const created = await db.user.create({
      data: { ...u, credits: RULES.STARTING_CREDITS },
    });
    users[u.handle] = created;
    await db.transaction.create({
      data: { userId: created.id, amount: RULES.STARTING_CREDITS, kind: "GRANT", memo: "Welcome grant" },
    });
  }
  console.log(`Created ${USERS.length} users.`);

  const voterHandles = USERS.map((u) => u.handle);

  for (const p of PITCHES) {
    const author = users[p.by];
    const greenlit = p.seedVotes >= RULES.GREENLIGHT_THRESHOLD;
    const pitch = await db.pitch.create({
      data: {
        title: p.title,
        genre: p.genre,
        logline: p.logline,
        prompt: p.prompt,
        authorId: author.id,
        voteCount: p.seedVotes,
        status: greenlit ? "GREENLIT" : "PITCHED",
        greenlitAt: greenlit ? new Date() : null,
      },
    });

    // Attach concrete Vote rows from distinct voters.
    const voters = voterHandles
      .filter((h) => h !== p.by)
      .slice(0, p.seedVotes);
    for (const h of voters) {
      await db.vote.create({ data: { pitchId: pitch.id, userId: users[h].id } });
    }

    // Auto-produce the flagship greenlit pitch so the site has a film on day one.
    if (greenlit) {
      const film = generateFilm({
        id: pitch.id,
        title: p.title,
        logline: p.logline,
        genre: p.genre,
        prompt: p.prompt,
      });
      await db.movie.create({
        data: {
          pitchId: pitch.id,
          tagline: film.tagline,
          synopsis: film.synopsis,
          posterSvg: film.posterSvg,
          runtimeSec: film.runtimeSec,
          scenesJson: JSON.stringify(film.scenes),
          ticketPrice: RULES.DEFAULT_TICKET_PRICE,
        },
      });
      await db.pitch.update({ where: { id: pitch.id }, data: { status: "RELEASED" } });
      console.log(`Produced "${p.title}" (released).`);
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
