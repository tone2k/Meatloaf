"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { voteAction } from "@/app/actions";

export function VoteButton({
  pitchId,
  voteCount,
  hasVoted,
  signedIn,
  closed,
}: {
  pitchId: string;
  voteCount: number;
  hasVoted: boolean;
  signedIn: boolean;
  closed: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  if (closed) {
    return (
      <span className="vote" style={{ cursor: "default", opacity: 0.8 }}>
        <span className="arrow">★</span>
        {voteCount}
      </span>
    );
  }

  return (
    <button
      className={`vote${hasVoted ? " voted" : ""}`}
      disabled={pending}
      title={signedIn ? (hasVoted ? "Retract vote" : "Vote to greenlight") : "Sign in to vote"}
      onClick={() =>
        start(async () => {
          if (!signedIn) {
            router.push("/?signin=1");
            return;
          }
          await voteAction(pitchId);
          router.refresh();
        })
      }
    >
      <span className="arrow">{hasVoted ? "▲" : "△"}</span>
      {voteCount}
    </button>
  );
}
