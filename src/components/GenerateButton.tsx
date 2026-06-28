"use client";

import { useTransition, useState } from "react";
import { generateMovieAction } from "@/app/actions";

const PHASES = [
  "Spinning up the studio engine…",
  "Breaking the prompt into beats…",
  "Blocking scenes & camera…",
  "Casting voices…",
  "Color-grading the palette…",
  "Rendering the poster…",
  "Locking the cut…",
];

export function GenerateButton({ pitchId }: { pitchId: string }) {
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState(0);

  function run() {
    // Cosmetic phase ticker while the server generates.
    let i = 0;
    const timer = setInterval(() => {
      i = Math.min(i + 1, PHASES.length - 1);
      setPhase(i);
    }, 650);
    start(async () => {
      try {
        await generateMovieAction(pitchId);
      } finally {
        clearInterval(timer);
      }
    });
  }

  if (pending) {
    return (
      <div className="panel" style={{ textAlign: "center" }}>
        <div className="badge badge-GENERATING" style={{ marginBottom: 12 }}>
          ● In Production
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
          {PHASES[phase]}
        </div>
        <div className="meter" style={{ marginTop: 16 }}>
          <span style={{ width: `${((phase + 1) / PHASES.length) * 100}%` }} />
        </div>
      </div>
    );
  }

  return (
    <button className="btn btn-green" onClick={run}>
      🎬 Roll camera — generate the film
    </button>
  );
}
