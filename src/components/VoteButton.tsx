"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voteAction } from "@/app/actions";
import { useToast } from "./Toast";
import { Celebration } from "./Celebration";

export function VoteButton({
  pitchId,
  title,
  voteCount,
  hasVoted,
  signedIn,
  closed,
}: {
  pitchId: string;
  title: string;
  voteCount: number;
  hasVoted: boolean;
  signedIn: boolean;
  closed: boolean;
}) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState({ count: voteCount, voted: hasVoted });
  const [celebrate, setCelebrate] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  if (closed) {
    return (
      <span className="vote closed" title="Voting closed — greenlit">
        <span className="arrow">★</span>
        {voteCount}
      </span>
    );
  }

  function onClick() {
    if (!signedIn) {
      toast("Sign in to vote.", "info");
      return;
    }
    // Optimistic toggle for instant feedback.
    const wasVoted = optimistic.voted;
    setOptimistic({
      count: optimistic.count + (wasVoted ? -1 : 1),
      voted: !wasVoted,
    });

    start(async () => {
      const res = await voteAction(pitchId);
      if (!res.ok) {
        setOptimistic({ count: voteCount, voted: hasVoted }); // revert
        toast(res.error, "error");
        return;
      }
      const data = res.data!;
      setOptimistic({ count: data.voteCount, voted: !wasVoted });
      if (data.greenlit) {
        setCelebrate(true);
      } else if (!wasVoted) {
        toast("Vote counted.", "success");
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        className={`vote${optimistic.voted ? " voted" : ""}`}
        disabled={pending}
        aria-pressed={optimistic.voted}
        title={optimistic.voted ? "Retract vote" : "Vote to greenlight"}
        onClick={onClick}
      >
        <span className="arrow">{optimistic.voted ? "▲" : "△"}</span>
        {optimistic.count}
      </button>
      <Celebration
        show={celebrate}
        title={title}
        onDone={() => {
          setCelebrate(false);
          router.refresh();
        }}
      />
    </>
  );
}
