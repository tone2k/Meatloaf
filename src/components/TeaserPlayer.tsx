"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene } from "@/lib/studio";
import { Score } from "@/lib/audio";

/**
 * A compact autoplay-on-click player for teaser trailers: fast scenes, captions,
 * the procedural score, and a loop. Lighter than the full feature Player (no
 * title card or end credits).
 */
export function TeaserPlayer({ scenes, tagline }: { scenes: Scene[]; tagline: string }) {
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const raf = useRef<number | null>(null);
  const startedAt = useRef(0);
  const score = useRef<Score | null>(null);
  const scene = scenes[i];

  useEffect(() => {
    if (!started) return;
    if (score.current) score.current.start(scene.tone);
    startedAt.current = performance.now();
    const dur = scene.durationSec * 1000;
    const tick = (now: number) => {
      const p = Math.min((now - startedAt.current) / dur, 1);
      setProgress(p);
      if (p >= 1) {
        setI((prev) => (prev + 1) % scenes.length); // loop
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, i]);

  useEffect(() => () => score.current?.stop(), []);

  function begin() {
    score.current = new Score();
    score.current.setMuted(muted);
    setStarted(true);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    score.current?.setMuted(next);
  }

  return (
    <div className="teaser">
      <div
        className="teaser-stage"
        style={{ background: `linear-gradient(160deg, ${scene.palette.from}, ${scene.palette.to})` }}
      >
        <div
          className="kenburns"
          style={{ background: `radial-gradient(circle at 50% 40%, ${scene.palette.accent}55, transparent 60%)` }}
        />
        {started ? (
          <>
            <div className="teaser-badge">TEASER</div>
            <div className="scene-heading" style={{ position: "absolute", top: 16, left: 18 }}>
              {scene.heading}
            </div>
            <div className="teaser-caption">{scene.caption}</div>
            <button className="teaser-mute" onClick={toggleMute} title="Toggle score">
              {muted ? "🔇" : "🔊"}
            </button>
          </>
        ) : (
          <button className="teaser-playbtn" onClick={begin}>
            <span className="teaser-play-icon">▶</span>
            <span className="teaser-play-label">Play teaser</span>
            <span className="faint" style={{ fontSize: 12 }}>{tagline}</span>
          </button>
        )}
        <div className="player-bar">
          <span style={{ width: `${((i + progress) / scenes.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
