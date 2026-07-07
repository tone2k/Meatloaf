"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { generateTrailerAction } from "@/app/actions";
import { RULES } from "@/lib/config";
import { useToast } from "./Toast";

const PHASES = ["Cutting the teaser…", "Scoring it…", "Grading the look…", "Exporting…"];

export function TrailerUpsell({ pitchId, credits }: { pitchId: string; credits: number }) {
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState(0);
  const router = useRouter();
  const { toast } = useToast();

  const affordable = credits >= RULES.TRAILER_COST;

  function run() {
    let k = 0;
    const timer = setInterval(() => {
      k = Math.min(k + 1, PHASES.length - 1);
      setPhase(k);
    }, 520);
    start(async () => {
      try {
        const res = await generateTrailerAction(pitchId);
        if (!res.ok) toast(res.error, "error");
        else {
          toast("Teaser trailer added — your pitch stands out now.", "success");
          router.refresh();
        }
      } finally {
        clearInterval(timer);
      }
    });
  }

  return (
    <div className="upsell">
      <div className="upsell-head">
        <span className="upsell-tag">UPGRADE</span>
        <h3 className="upsell-title">🎞️ Add a Teaser Trailer</h3>
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>
        Generate a short, scored teaser that plays right on the board and pitch page — pitches with a
        teaser stand out and climb the race faster. <b>{RULES.TRAILER_COST} credits</b>, and it's{" "}
        <b style={{ color: "var(--green)" }}>fully refunded if your pitch gets greenlit.</b>
      </p>

      {pending ? (
        <div className="production" style={{ padding: 18 }}>
          <div className="production-phase" style={{ fontSize: 16 }}>{PHASES[phase]}</div>
          <div className="meter" style={{ marginTop: 12 }}>
            <span style={{ width: `${((phase + 1) / PHASES.length) * 100}%` }} />
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={run} disabled={!affordable}>
          {affordable ? `🎬 Generate teaser · ${RULES.TRAILER_COST} cr` : `Need ${RULES.TRAILER_COST} cr (you have ${credits})`}
        </button>
      )}
    </div>
  );
}
