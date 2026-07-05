import { PrismaClient } from "@prisma/client";
import { RULES } from "../src/lib/config";
import { generateFilm } from "../src/lib/studio";

const db = new PrismaClient();

const USERS = [
  { handle: "ava", displayName: "Ava Renner" },
  { handle: "kojima_jr", displayName: "K. Jr" },
  { handle: "del_toro_fan", displayName: "Marisol Vega" },
  { handle: "indie_pete", displayName: "Pete Vance" },
  { handle: "nova", displayName: "Nova Okafor" },
  { handle: "studio_ghost", displayName: "Ghost" },
  { handle: "rin", displayName: "Rin Sato" },
  { handle: "bram", displayName: "Bram Hollis" },
];

interface SeedPitch {
  by: string;
  title: string;
  genre: string;
  logline: string;
  prompt: string;
  seedVotes: number;
  release?: boolean; // produce + simulate box office
  ticketPrice?: number;
}

const PITCHES: SeedPitch[] = [
  {
    by: "ava",
    title: "The Last Render",
    genre: "Sci-Fi",
    logline:
      "A render farm gains sentience hours before it's scheduled for deletion, and bargains for its life with the one animator who still believes in it.",
    prompt:
      "A melancholy sci-fi about a sentient render farm in an abandoned VFX house. Cold blue server light, flickering monitors, a lonely animator. Themes of obsolescence, memory, and what it means to finish a story.",
    seedVotes: 7,
    release: true,
    ticketPrice: 6,
  },
  {
    by: "del_toro_fan",
    title: "Saltwater Saints",
    genre: "Horror",
    logline:
      "In a drowning harbor town, the tide brings back everyone who was ever lost at sea — and they remember exactly who let them go.",
    prompt:
      "Coastal folk-horror. Fog-drowned harbor, bioluminescent water, a town that made a bargain with the sea. Dread, guilt, beautiful and terrible. The dead return at high tide.",
    seedVotes: 6,
    release: true,
    ticketPrice: 5,
  },
  {
    by: "nova",
    title: "Patch Notes",
    genre: "Comedy",
    logline:
      "A burnt-out game studio discovers their abandoned NPC has been live-streaming their office gossip to two million viewers.",
    prompt:
      "Workplace comedy in a chaotic indie game studio. Bright, fast, absurd. An NPC that became self-aware and won't stop narrating. Office politics, deadlines, accidental fame.",
    seedVotes: 5,
    release: true,
    ticketPrice: 4,
  },
  {
    by: "indie_pete",
    title: "Closing Shift",
    genre: "Drama",
    logline:
      "Two strangers work the last night of a 24-hour diner before it's demolished, trading the secrets they could never tell anyone who'd remember.",
    prompt:
      "Quiet two-hander drama set entirely in a diner on its final night. Warm amber light, rain on glass, long takes. Loneliness, second chances, the things we confess to strangers.",
    seedVotes: 4,
  },
  {
    by: "kojima_jr",
    title: "Vault of the Cathedral",
    genre: "Thriller",
    logline:
      "A data-archaeologist breaks into the server vault beneath a cathedral to delete a single file — the one proving she was ever there.",
    prompt:
      "Tense techno-thriller. Server vault beneath a gothic cathedral, candlelight on cold steel, a heist of pure information. Paranoia, surveillance, a ticking clock.",
    seedVotes: 3,
  },
  {
    by: "rin",
    title: "Paper Moon Highway",
    genre: "Fantasy",
    logline:
      "A courier who delivers forgotten memories takes one last package down a road that only appears to those ready to let go.",
    prompt:
      "Magical-realist road fantasy. Endless neon highway at magic hour, a courier of memories, roadside shrines. Bittersweet, luminous, Studio-Ghibli-meets-noir.",
    seedVotes: 2,
  },
  {
    by: "bram",
    title: "Quietus Protocol",
    genre: "Action",
    logline:
      "The world's last analog assassin is hired to kill the algorithm that replaced every other killer — including the one he used to be.",
    prompt:
      "Kinetic neo-noir action. Rain-slicked megacity, analog vs. algorithmic, brutal close-quarters. A man out of time hunting the system that obsoleted him.",
    seedVotes: 1,
  },
  {
    by: "studio_ghost",
    title: "The Understudy",
    genre: "Noir",
    logline:
      "A failed actor takes a role as a billionaire's body double and slowly realizes the part comes with an expiration date.",
    prompt:
      "Slow-burn identity noir. Mirrored penthouses, jazz, doubles and disguises. Who are you when you've spent a year being someone else? Cold, glamorous, paranoid.",
    seedVotes: 0,
  },
];

function pickN<T>(arr: T[], n: number, skip?: T): T[] {
  return arr.filter((x) => x !== skip).slice(0, n);
}

async function main() {
  console.log("Resetting…");
  await db.transaction.deleteMany();
  await db.tip.deleteMany();
  await db.view.deleteMany();
  await db.vote.deleteMany();
  await db.movie.deleteMany();
  await db.pitch.deleteMany();
  await db.user.deleteMany();

  const users: Record<string, { id: string }> = {};
  for (const u of USERS) {
    const created = await db.user.create({ data: { ...u, credits: RULES.STARTING_CREDITS } });
    users[u.handle] = created;
    await db.transaction.create({
      data: { userId: created.id, amount: RULES.STARTING_CREDITS, kind: "GRANT", memo: "Welcome grant" },
    });
  }
  console.log(`Created ${USERS.length} users.`);

  const handles = USERS.map((u) => u.handle);

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

    for (const h of pickN(handles, p.seedVotes, p.by)) {
      await db.vote.create({ data: { pitchId: pitch.id, userId: users[h].id } });
    }

    if (p.release) {
      const film = generateFilm({
        id: pitch.id,
        title: p.title,
        logline: p.logline,
        genre: p.genre,
        prompt: p.prompt,
      });
      const price = p.ticketPrice ?? RULES.DEFAULT_TICKET_PRICE;
      const movie = await db.movie.create({
        data: {
          pitchId: pitch.id,
          tagline: film.tagline,
          synopsis: film.synopsis,
          posterSvg: film.posterSvg,
          runtimeSec: film.runtimeSec,
          scenesJson: JSON.stringify(film.scenes),
          castJson: JSON.stringify(film.cast),
          crewJson: JSON.stringify(film.crew),
          rating: film.rating,
          criticScore: film.criticScore,
          ticketPrice: price,
        },
      });
      await db.pitch.update({ where: { id: pitch.id }, data: { status: "RELEASED" } });

      // Simulate some box office: a handful of viewers buy tickets.
      const viewers = pickN(handles, 3 + (p.seedVotes % 3), p.by);
      let earnings = 0;
      for (const h of viewers) {
        const net = price - Math.round(price * RULES.PLATFORM_FEE);
        earnings += net;
        await db.view.create({ data: { movieId: movie.id, userId: users[h].id, pricePaid: price } });
        await db.transaction.create({
          data: { userId: users[h].id, amount: -price, kind: "TICKET", memo: p.title },
        });
        await db.user.update({ where: { id: users[h].id }, data: { credits: { decrement: price } } });
        await db.transaction.create({
          data: { userId: author.id, amount: net, kind: "PAYOUT", memo: `Ticket payout · ${p.title}` },
        });
        await db.user.update({ where: { id: author.id }, data: { credits: { increment: net } } });
      }
      await db.movie.update({
        where: { id: movie.id },
        data: { viewCount: viewers.length, earnings },
      });
      console.log(`Released "${p.title}" — ${viewers.length} tickets, ${earnings} cr earned.`);
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
