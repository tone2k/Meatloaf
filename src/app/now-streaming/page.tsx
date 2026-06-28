import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PitchCard, type PitchCardData } from "@/components/PitchCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Now Streaming" };

export default async function NowStreamingPage() {
  const user = await getCurrentUser();

  const pitches = await db.pitch.findMany({
    where: { status: "RELEASED" },
    include: { author: true, movie: { select: { posterSvg: true, criticScore: true } } },
    orderBy: { greenlitAt: "desc" },
  });

  const cards: PitchCardData[] = pitches.map((p) => ({
    id: p.id,
    title: p.title,
    logline: p.logline,
    genre: p.genre,
    status: p.status,
    voteCount: p.voteCount,
    authorHandle: p.author.handle,
    hasVoted: false,
    posterSvg: p.movie?.posterSvg ?? null,
    criticScore: p.movie?.criticScore ?? null,
  }));

  return (
    <>
      <h1 className="page-title">Now Streaming</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Films the crowd greenlit and the studio engine made real.
      </p>
      {cards.length === 0 ? (
        <div className="empty">No films released yet. Vote a pitch past the threshold to greenlight one.</div>
      ) : (
        <div className="grid">
          {cards.map((p) => (
            <PitchCard key={p.id} pitch={p} signedIn={!!user} />
          ))}
        </div>
      )}
    </>
  );
}
