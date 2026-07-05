import Link from "next/link";
import { RULES, STATUS_LABEL } from "@/lib/config";
import { VoteButton } from "./VoteButton";

export interface PitchCardData {
  id: string;
  title: string;
  logline: string;
  genre: string;
  status: string;
  voteCount: number;
  authorHandle: string;
  hasVoted: boolean;
  isAuthor?: boolean;
  posterSvg?: string | null;
  criticScore?: number | null;
}

export function PitchCard({
  pitch,
  signedIn,
}: {
  pitch: PitchCardData;
  signedIn: boolean;
}) {
  const released = pitch.status === "RELEASED";
  const href = released ? `/watch/${pitch.id}` : `/pitch/${pitch.id}`;
  const pct = Math.min(100, (pitch.voteCount / RULES.GREENLIGHT_THRESHOLD) * 100);
  const remaining = Math.max(0, RULES.GREENLIGHT_THRESHOLD - pitch.voteCount);

  return (
    <div className="card">
      {released && pitch.posterSvg && (
        <Link href={href} className="poster-link">
          <span className="poster-wrap" dangerouslySetInnerHTML={{ __html: pitch.posterSvg }} />
          {typeof pitch.criticScore === "number" && (
            <span className="score-chip" title="Critic score">
              {pitch.criticScore}
            </span>
          )}
          <span className="poster-play">▶</span>
        </Link>
      )}
      <div className="card-body">
        <div className="card-foot" style={{ marginBottom: 2 }}>
          <span className={`badge badge-${pitch.status}`}>
            {pitch.status === "RELEASED" ? "● " : ""}
            {STATUS_LABEL[pitch.status]}
          </span>
          <span className="genre-tag">{pitch.genre}</span>
        </div>

        <Link href={href} className="card-title">
          {pitch.title}
        </Link>
        <p className="card-logline">{pitch.logline}</p>

        {pitch.status === "PITCHED" && (
          <div>
            <div className="meter">
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
              {remaining === 0
                ? "Threshold reached!"
                : `${remaining} more vote${remaining === 1 ? "" : "s"} to greenlight`}
            </div>
          </div>
        )}

        <div className="card-foot">
          <span className="faint" style={{ fontSize: 13 }}>
            by @{pitch.authorHandle}
          </span>
          <VoteButton
            pitchId={pitch.id}
            title={pitch.title}
            voteCount={pitch.voteCount}
            hasVoted={pitch.hasVoted}
            signedIn={signedIn}
            closed={pitch.status !== "PITCHED"}
            isAuthor={pitch.isAuthor}
          />
        </div>
      </div>
    </div>
  );
}
