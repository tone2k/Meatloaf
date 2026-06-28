import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { RULES } from "@/lib/config";
import { PitchCard, type PitchCardData } from "@/components/PitchCard";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await getCurrentUser();

  const pitches = await db.pitch.findMany({
    include: {
      author: true,
      movie: { select: { posterSvg: true } },
      votes: user ? { where: { userId: user.id }, select: { id: true } } : false,
    },
    orderBy: [{ status: "asc" }, { voteCount: "desc" }, { createdAt: "desc" }],
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
    posterSvg: p.movie?.posterSvg ?? null,
  });

  const inDev = pitches.filter((p) => p.status === "PITCHED").map(toCard);
  const inProduction = pitches
    .filter((p) => p.status === "GREENLIT" || p.status === "GENERATING")
    .map(toCard);
  const streaming = pitches.filter((p) => p.status === "RELEASED").map(toCard);

  const signedIn = !!user;

  return (
    <>
      <section className="hero">
        <h1>The studio where the best pitch gets made.</h1>
        <p>
          Pitch a movie as a single prompt. The crowd votes. Cross{" "}
          <b style={{ color: "var(--green)" }}>{RULES.GREENLIGHT_THRESHOLD} votes</b> and your
          pitch is <b>greenlit</b> — you become director, the studio engine generates the film,
          and it streams for credits that flow back to you.
        </p>
        <div className="steps">
          <span className="step">
            <b>1.</b> Pitch
          </span>
          <span className="step">
            <b>2.</b> The crowd votes
          </span>
          <span className="step">
            <b>3.</b> Greenlit → you direct
          </span>
          <span className="step">
            <b>4.</b> Generate
          </span>
          <span className="step">
            <b>5.</b> Stream & earn
          </span>
        </div>
        {!signedIn && (
          <p className="faint" style={{ fontSize: 14, marginTop: 16 }}>
            Sign in with any handle to vote and pitch — you'll get {RULES.STARTING_CREDITS} studio
            credits to start.
          </p>
        )}
      </section>

      {streaming.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Now Streaming</h2>
            <Link href="/now-streaming" className="muted" style={{ fontSize: 14 }}>
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
          <h2>In Development</h2>
          <Link href="/pitch/new" className="btn btn-primary btn-sm">
            + New pitch
          </Link>
        </div>
        {inDev.length === 0 ? (
          <div className="empty">No open pitches. Be the first to pitch a film.</div>
        ) : (
          <div className="grid">
            {inDev.map((p) => (
              <PitchCard key={p.id} pitch={p} signedIn={signedIn} />
            ))}
          </div>
        )}
      </section>

      {inProduction.length > 0 && (
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
