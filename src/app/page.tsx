import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { RULES } from "@/lib/config";
import { PitchCard, type PitchCardData } from "@/components/PitchCard";
import { BoardControls } from "@/components/BoardControls";

export const dynamic = "force-dynamic";

type Search = { sort?: string; genre?: string; q?: string };

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { sort = "hot", genre = "", q = "" } = await searchParams;
  const user = await getCurrentUser();

  const pitches = await db.pitch.findMany({
    where: {
      ...(genre ? { genre } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { logline: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      author: true,
      movie: { select: { posterSvg: true, criticScore: true } },
      votes: user ? { where: { userId: user.id }, select: { id: true } } : false,
    },
    orderBy:
      sort === "new"
        ? [{ createdAt: "desc" }]
        : sort === "top"
          ? [{ voteCount: "desc" }, { createdAt: "desc" }]
          : [{ status: "asc" }, { voteCount: "desc" }, { createdAt: "desc" }],
  });

  const toCard = (p: (typeof pitches)[number]): PitchCardData => ({
    id: p.id,
    title: p.title,
    logline: p.logline,
    genre: p.genre,
    status: p.status,
    voteCount: p.voteCount,
    authorHandle: p.author.handle,
    hasVoted: Array.isArray(p.votes) && p.votes.length > 0,
    isAuthor: !!user && p.authorId === user.id,
    hasTrailer: !!p.trailerJson,
    posterSvg: p.movie?.posterSvg ?? null,
    criticScore: p.movie?.criticScore ?? null,
  });

  const cards = pitches.map(toCard);
  const filtering = !!(genre || q);

  const streaming = cards.filter((p) => p.status === "RELEASED");
  const inDev = cards.filter((p) => p.status === "PITCHED");
  const inProduction = cards.filter((p) => p.status === "GREENLIT" || p.status === "GENERATING");
  const signedIn = !!user;

  // When sorting by new/top or filtering, show one flat ranked list.
  const flat = sort !== "hot" || filtering;

  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden />
        <span className="hero-kicker">GENERATIVE AI MOVIE STUDIO</span>
        <h1>The studio where the best pitch gets made.</h1>
        <p>
          Pitch a movie as a single prompt, then compete on the{" "}
          <Link href="/leaderboard" className="link" style={{ color: "var(--green)" }}>
            Greenlight Race
          </Link>
          . <b>Anyone can vote — you don't have to pitch.</b> Only prompts that rise above the crowd
          and cross the <b style={{ color: "var(--green)" }}>greenlight line ({RULES.GREENLIGHT_THRESHOLD} votes)</b> get
          made — then you direct, the studio generates the film, and it streams for credits that flow
          back to you.
        </p>
        <div className="steps">
          <span className="step"><b>1</b> Pitch</span>
          <span className="step-arrow">→</span>
          <span className="step"><b>2</b> The crowd votes</span>
          <span className="step-arrow">→</span>
          <span className="step"><b>3</b> Greenlit · you direct</span>
          <span className="step-arrow">→</span>
          <span className="step"><b>4</b> Generate</span>
          <span className="step-arrow">→</span>
          <span className="step"><b>5</b> Stream &amp; earn</span>
        </div>
        {!signedIn && (
          <div className="hero-cta">
            <Link href="/pitch/new" className="btn btn-primary btn-lg">
              Pitch your movie
            </Link>
            <span className="faint" style={{ fontSize: 14 }}>
              Sign in with any handle — you'll get {RULES.STARTING_CREDITS} studio credits to start.
            </span>
          </div>
        )}
      </section>

      {!flat && streaming.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Now Streaming</h2>
            <Link href="/now-streaming" className="link" style={{ fontSize: 14 }}>
              See all →
            </Link>
          </div>
          <div className="grid">
            {streaming.slice(0, 4).map((p) => (
              <PitchCard key={p.id} pitch={p} signedIn={signedIn} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>{flat ? "Pitches" : "In Development"}</h2>
          <Link href="/pitch/new" className="btn btn-primary btn-sm">
            + New pitch
          </Link>
        </div>
        <BoardControls />
        {(flat ? cards : inDev).length === 0 ? (
          <div className="empty">
            {filtering ? "No pitches match your filters." : "No open pitches. Be the first to pitch a film."}
          </div>
        ) : (
          <div className="grid">
            {(flat ? cards : inDev).map((p) => (
              <PitchCard key={p.id} pitch={p} signedIn={signedIn} />
            ))}
          </div>
        )}
      </section>

      {!flat && inProduction.length > 0 && (
        <section>
          <div className="section-head">
            <h2>In Production</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              Greenlit — awaiting the director's call to roll camera
            </span>
          </div>
          <div className="grid">
            {inProduction.map((p) => (
              <PitchCard key={p.id} pitch={p} signedIn={signedIn} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
