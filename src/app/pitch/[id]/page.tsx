import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { RULES, STATUS_LABEL } from "@/lib/config";
import { ago } from "@/lib/format";
import { VoteButton } from "@/components/VoteButton";
import { GenerateButton } from "@/components/GenerateButton";

export const dynamic = "force-dynamic";

export default async function PitchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const pitch = await db.pitch.findUnique({
    where: { id },
    include: {
      author: true,
      movie: { select: { pitchId: true } },
      votes: user ? { where: { userId: user.id }, select: { id: true } } : false,
    },
  });

  if (!pitch) notFound();
  if (pitch.status === "RELEASED") redirect(`/watch/${pitch.id}`);

  const isDirector = user?.id === pitch.authorId;
  const hasVoted = Array.isArray(pitch.votes) && pitch.votes.length > 0;
  const pct = Math.min(100, (pitch.voteCount / RULES.GREENLIGHT_THRESHOLD) * 100);
  const remaining = Math.max(0, RULES.GREENLIGHT_THRESHOLD - pitch.voteCount);

  return (
    <>
      <div className="crumbs">
        <Link href="/">Board</Link> / {pitch.title}
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div className="card-foot" style={{ justifyContent: "flex-start", gap: 10 }}>
            <span className={`badge badge-${pitch.status}`}>{STATUS_LABEL[pitch.status]}</span>
            <span className="genre-tag">{pitch.genre}</span>
          </div>
          <h1 style={{ fontSize: 40, margin: "12px 0 8px" }}>{pitch.title}</h1>
          <p className="muted" style={{ fontSize: 17, maxWidth: "60ch" }}>
            {pitch.logline}
          </p>
          <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>
            Pitched by{" "}
            <Link href={`/u/${pitch.author.handle}`} style={{ color: "var(--text-dim)" }}>
              @{pitch.author.handle}
            </Link>{" "}
            · {ago(pitch.createdAt)}
            {pitch.greenlitAt && ` · greenlit ${ago(pitch.greenlitAt)}`}
          </p>
        </div>

        <div className="panel" style={{ flex: "0 0 260px" }}>
          <div className="stat" style={{ marginBottom: 14 }}>
            <span className="n">{pitch.voteCount}</span>
            <span className="l">Votes</span>
          </div>
          {pitch.status === "PITCHED" ? (
            <>
              <div className="meter" style={{ marginBottom: 8 }}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="faint" style={{ fontSize: 13, marginBottom: 14 }}>
                {remaining === 0
                  ? "Threshold reached — greenlighting…"
                  : `${remaining} more to greenlight`}
              </p>
              <VoteButton
                pitchId={pitch.id}
                title={pitch.title}
                voteCount={pitch.voteCount}
                hasVoted={hasVoted}
                signedIn={!!user}
                closed={false}
              />
            </>
          ) : (
            <p className="faint" style={{ fontSize: 13 }}>
              Voting closed — this pitch was greenlit.
            </p>
          )}
        </div>
      </div>

      <div className="divider" />

      <div className="panel">
        <h3 style={{ fontSize: 15, marginBottom: 10, color: "var(--text-dim)" }}>
          The generative prompt
        </h3>
        <p style={{ fontSize: 16, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{pitch.prompt}</p>
      </div>

      {pitch.status === "GREENLIT" && (
        <div style={{ marginTop: 18 }}>
          {isDirector ? (
            <div className="panel">
              <h3 style={{ fontSize: 18, marginBottom: 6 }}>🎬 You're the director.</h3>
              <p className="muted" style={{ marginBottom: 16 }}>
                Your pitch crossed the threshold, so you hold director &amp; producer rights. Roll
                camera to generate the film — once it's in the can it streams and earns.
              </p>
              <GenerateButton pitchId={pitch.id} />
            </div>
          ) : (
            <div className="panel">
              <p className="muted">
                Greenlit. Waiting on director{" "}
                <b>@{pitch.author.handle}</b> to roll camera.
              </p>
            </div>
          )}
        </div>
      )}

      {pitch.status === "GENERATING" && (
        <div className="panel" style={{ marginTop: 18 }}>
          <span className="badge badge-GENERATING">● In Production</span>
          <p className="muted" style={{ marginTop: 10 }}>The studio engine is rendering this film…</p>
        </div>
      )}
    </>
  );
}
