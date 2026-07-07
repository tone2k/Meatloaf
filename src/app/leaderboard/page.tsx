import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { RULES } from "@/lib/config";
import { plural } from "@/lib/format";
import { VoteButton } from "@/components/VoteButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The Greenlight Race" };

export default async function LeaderboardPage() {
  const user = await getCurrentUser();

  const pitches = await db.pitch.findMany({
    where: { status: "PITCHED" },
    include: {
      author: true,
      votes: user ? { where: { userId: user.id }, select: { id: true } } : false,
    },
    orderBy: [{ voteCount: "desc" }, { createdAt: "asc" }],
  });

  const totalVotes = pitches.reduce((s, p) => s + p.voteCount, 0) || 1;
  const recentlyMade = await db.pitch.findMany({
    where: { status: "RELEASED" },
    include: { author: true },
    orderBy: { greenlitAt: "desc" },
    take: 3,
  });

  return (
    <>
      <div className="race-hero">
        <span className="hero-kicker">THE GREENLIGHT RACE</span>
        <h1 className="page-title" style={{ marginTop: 6 }}>
          The crowd decides which prompts get made.
        </h1>
        <p className="muted" style={{ maxWidth: "62ch" }}>
          Every pitch competes for votes on one public board. Only prompts that rise above the crowd
          and cross the <b style={{ color: "var(--green)" }}>greenlight line ({RULES.GREENLIGHT_THRESHOLD} votes)</b>{" "}
          get produced. <b>Anyone can vote — you don't have to pitch.</b>
        </p>
      </div>

      {pitches.length === 0 ? (
        <div className="empty">No pitches in the race yet. Be the first.</div>
      ) : (
        <ol className="race">
          {pitches.map((p, idx) => {
            const share = Math.round((p.voteCount / totalVotes) * 100);
            const pct = Math.min(100, (p.voteCount / RULES.GREENLIGHT_THRESHOLD) * 100);
            const remaining = Math.max(0, RULES.GREENLIGHT_THRESHOLD - p.voteCount);
            const contender = idx < 3;
            const hasVoted = Array.isArray(p.votes) && p.votes.length > 0;
            return (
              <li key={p.id} className={`race-row${contender ? " contender" : ""}`}>
                <div className="race-rank">{idx + 1}</div>
                <div className="race-main">
                  <div className="race-title-line">
                    <Link href={`/pitch/${p.id}`} className="race-title">
                      {p.title}
                    </Link>
                    {p.trailerJson && <span className="badge trailer-badge">▶ Teaser</span>}
                    <span className="genre-tag">{p.genre}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 13, marginBottom: 8 }}>
                    @{p.author.handle} · {share}% of the vote · {remaining === 0 ? "at the line" : `${remaining} to go`}
                  </div>
                  <div className="race-meter" title={`${plural(p.voteCount, "vote")} of ${RULES.GREENLIGHT_THRESHOLD}`}>
                    <span style={{ width: `${pct}%` }} />
                    <i className="race-line" />
                  </div>
                </div>
                <div className="race-votes">
                  <VoteButton
                    pitchId={p.id}
                    title={p.title}
                    voteCount={p.voteCount}
                    hasVoted={hasVoted}
                    signedIn={!!user}
                    closed={false}
                    isAuthor={!!user && p.authorId === user.id}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {recentlyMade.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2 className="subhead-lg">Recently crossed the line</h2>
          <div className="pill-list">
            {recentlyMade.map((p) => (
              <Link key={p.id} href={`/watch/${p.id}`} className="made-chip">
                <b>{p.title}</b> <span className="faint">· @{p.author.handle}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
