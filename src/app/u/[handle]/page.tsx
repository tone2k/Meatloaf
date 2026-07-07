import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PitchCard, type PitchCardData } from "@/components/PitchCard";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const viewer = await getCurrentUser();

  const user = await db.user.findUnique({
    where: { handle },
    include: {
      pitches: {
        include: { author: true, movie: { select: { posterSvg: true, criticScore: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) notFound();

  const directed = user.pitches.filter((p) => p.status === "RELEASED");
  const earnings = await db.movie.aggregate({
    where: { pitch: { authorId: user.id } },
    _sum: { earnings: true },
  });

  const toCard = (p: (typeof user.pitches)[number]): PitchCardData => ({
    id: p.id,
    title: p.title,
    logline: p.logline,
    genre: p.genre,
    status: p.status,
    voteCount: p.voteCount,
    authorHandle: user.handle,
    hasVoted: false,
    isAuthor: !!viewer && viewer.id === user.id,
    hasTrailer: !!p.trailerJson,
    posterSvg: p.movie?.posterSvg ?? null,
    criticScore: p.movie?.criticScore ?? null,
  });

  return (
    <>
      <h1 style={{ fontSize: 34, margin: "28px 0 4px" }}>{user.displayName}</h1>
      <p className="muted" style={{ marginBottom: 18 }}>@{user.handle}</p>

      <div className="panel">
        <div className="row" style={{ gap: 36 }}>
          <div className="stat">
            <span className="n">{user.pitches.length}</span>
            <span className="l">Pitches</span>
          </div>
          <div className="stat">
            <span className="n">{directed.length}</span>
            <span className="l">Directed</span>
          </div>
          <div className="stat">
            <span className="n" style={{ color: "var(--green)" }}>
              {earnings._sum.earnings ?? 0}
            </span>
            <span className="l">Credits earned</span>
          </div>
        </div>
      </div>

      <div className="section-head">
        <h2>Filmography</h2>
      </div>
      {user.pitches.length === 0 ? (
        <div className="empty">Nothing here yet.</div>
      ) : (
        <div className="grid">
          {user.pitches.map((p) => (
            <PitchCard key={p.id} pitch={toCard(p)} signedIn={!!viewer} />
          ))}
        </div>
      )}
    </>
  );
}
