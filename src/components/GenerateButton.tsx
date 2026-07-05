"use client";

import { useTransition, useState } from "react";
import { generateMovieAction } from "@/app/actions";
import { useToast } from "./Toast";

const PHASES = [
  "Spinning up the studio engine…",
  "Breaking the prompt into beats…",
  "Blocking scenes & camera…",
  "Casting the leads…",
  "Recording the score…",
  "Color-grading the palette…",
  "Rendering the poster…",
  "Locking the final cut…",
];

export function GenerateButton({ pitchId }: { pitchId: string }) {
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState(0);
  const { toast } = useToast();

  function run() {
    let i = 0;
    const timer = setInterval(() => {
      i = Math.min(i + 1, PHASES.length - 1);
      setPhase(i);
    }, 620);
    start(async () => {
      try {
        const res = await generateMovieAction(pitchId);
        // Success redirects; only a failure result returns here.
        if (res && !res.ok) toast(res.error, "error");
      } finally {
        clearInterval(timer);
      }
    });
  }

  if (pending) {
    return (
      <div className="production">
        <div className="badge badge-GENERATING" style={{ marginBottom: 14 }}>
          ● In Production
        </div>
        <div className="production-phase">{PHASES[phase]}</div>
        <div className="meter" style={{ marginTop: 16 }}>
          <span style={{ width: `${((phase + 1) / PHASES.length) * 100}%` }} />
        </div>
        <div className="reel" aria-hidden>
          {Array.from({ length: 8 }).map((_, k) => (
            <i key={k} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <button className="btn btn-green btn-lg" onClick={run}>
      🎬 Roll camera — generate the film
    </button>
  );
}
