"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import type { Scene, CastMember, Crew } from "@/lib/studio";
import { Score } from "@/lib/audio";

type Phase = "title" | "scene" | "credits";

const TITLE_MS = 4000;
const CREDITS_MS = 9000;

export function Player({
  title,
  tagline,
  scenes,
  cast,
  crew,
  directorName,
}: {
  title: string;
  tagline: string;
  scenes: Scene[];
  cast: CastMember[];
  crew: Crew;
  directorName: string;
}) {
  const [phase, setPhase] = useState<Phase>("title");
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const raf = useRef<number | null>(null);
  const startedAt = useRef(0);
  const elapsedBefore = useRef(0);
  const score = useRef<Score | null>(null);

  // Credits scroll is measured, not a fixed CSS distance, so it never scrolls
  // fully off-screen and leaves a black gap regardless of how tall the credits
  // are or how big the player is rendered.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rollRef = useRef<HTMLDivElement | null>(null);
  const [creditsTravel, setCreditsTravel] = useState({ start: 0, end: 0 });

  useLayoutEffect(() => {
    if (phase !== "credits") return;
    const stage = stageRef.current;
    const roll = rollRef.current;
    if (!stage || !roll) return;
    const containerH = stage.clientHeight;
    const contentH = roll.scrollHeight;
    // Start with the whole roll just below the frame; end with its last line
    // resting ~40% down from the top, so the final frame is never empty.
    const start = containerH;
    const end = Math.min(start, containerH * 0.4 - contentH);
    setCreditsTravel({ start, end });
  }, [phase]);

  const scene = scenes[i];

  const phaseMs = phase === "title" ? TITLE_MS : phase === "credits" ? CREDITS_MS : scene.durationSec * 1000;

  // Drive the procedural score from the current scene.
  useEffect(() => {
    if (!score.current) return;
    if (phase === "scene" && playing) score.current.start(scene.tone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  const advance = useCallback(() => {
    elapsedBefore.current = 0;
    setProgress(0);
    if (phase === "title") {
      setPhase("scene");
      setI(0);
    } else if (phase === "scene") {
      if (i < scenes.length - 1) setI(i + 1);
      else {
        setPhase("credits");
        score.current?.setScene(0.2);
      }
    } else {
      setPlaying(false); // credits finished
    }
  }, [phase, i, scenes.length]);

  useEffect(() => {
    if (!playing) return;
    startedAt.current = performance.now() - elapsedBefore.current;
    const tick = (now: number) => {
      const p = Math.min((now - startedAt.current) / phaseMs, 1);
      setProgress(p);
      if (p >= 1) {
        advance();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      elapsedBefore.current = performance.now() - startedAt.current;
    };
  }, [playing, phase, i, phaseMs, advance]);

  // Lazily build the score on first play; tear down on unmount.
  function togglePlay() {
    if (!score.current) score.current = new Score();
    const next = !playing;
    setPlaying(next);
    if (next && phase === "scene") score.current.start(scene.tone);
    if (next) score.current.setMuted(muted);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    score.current?.setMuted(next);
  }

  function restart() {
    elapsedBefore.current = 0;
    setProgress(0);
    setPhase("title");
    setI(0);
    setPlaying(true);
  }

  function jumpToScene(idx: number) {
    if (!score.current) score.current = new Score();
    elapsedBefore.current = 0;
    setProgress(0);
    setPhase("scene");
    setI(idx);
    setPlaying(true);
    score.current.start(scenes[idx].tone);
    score.current.setMuted(muted);
  }

  useEffect(() => {
    return () => score.current?.stop();
  }, []);

  // Keyboard: space = play/pause, arrows = prev/next scene, m = mute.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") jumpToScene(Math.min(scenes.length - 1, i + 1));
      else if (e.code === "ArrowLeft") jumpToScene(Math.max(0, i - 1));
      else if (e.key.toLowerCase() === "m") toggleMute();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing, muted, phase]);

  const ended = !playing && phase === "credits" && progress >= 1;
  const overall =
    phase === "title" ? 0 : phase === "credits" ? 1 : (i + progress) / scenes.length;

  return (
    <div>
      <div className="player">
        {/* TITLE CARD */}
        {phase === "title" && (
          <div
            className="player-stage title-card"
            style={{ background: `linear-gradient(160deg, ${scenes[0].palette.from}, ${scenes[0].palette.to})` }}
          >
            <div className="title-card-inner">
              <div className="title-card-studio">{crew.studio} presents</div>
              <h2 className="title-card-title">{title}</h2>
              <div className="title-card-tag">{tagline}</div>
            </div>
          </div>
        )}

        {/* SCENE */}
        {phase === "scene" && (
          <div
            key={i}
            className="player-stage scene-fade"
            style={{ background: `linear-gradient(160deg, ${scene.palette.from}, ${scene.palette.to})` }}
          >
            <div
              className="kenburns"
              style={{ background: `radial-gradient(circle at 50% 35%, ${scene.palette.accent}55, transparent 60%)` }}
            />
            <div className="scene-shot">{scene.shot}</div>
            <div className="scene-meta">ACT {scene.act}</div>
            <div style={{ position: "relative" }}>
              <div className="scene-heading">{scene.heading}</div>
              <div className="scene-action">{scene.action}</div>
              {scene.dialogue && (
                <div className="scene-dialogue">
                  <span className="speaker">{scene.dialogue.speaker}</span>“{scene.dialogue.line}”
                </div>
              )}
            </div>
            <div className="scene-caption">{scene.caption}</div>
          </div>
        )}

        {/* END CREDITS */}
        {phase === "credits" && (
          <div className="player-stage credits-stage" ref={stageRef}>
            <div
              className="credits-roll"
              ref={rollRef}
              style={{
                transform: `translateY(${
                  creditsTravel.start + (creditsTravel.end - creditsTravel.start) * progress
                }px)`,
              }}
            >
              <div className="credits-title">{title}</div>
              <div className="credits-block">
                <div className="credits-role">Directed &amp; Produced by</div>
                <div className="credits-name big">{directorName}</div>
              </div>
              <div className="credits-block">
                <div className="credits-role">Starring</div>
                {cast.map((c) => (
                  <div key={c.role} className="credits-name">
                    {c.actor} <span className="faint">— {c.role}</span>
                  </div>
                ))}
              </div>
              <div className="credits-block">
                <div className="credits-role">Cinematography</div>
                <div className="credits-name">{crew.cinematographer}</div>
                <div className="credits-role">Original Score</div>
                <div className="credits-name">{crew.composer}</div>
                <div className="credits-role">Editor</div>
                <div className="credits-name">{crew.editor}</div>
              </div>
              <div className="credits-block">
                <div className="credits-role">A</div>
                <div className="credits-name">{crew.studio}</div>
                <div className="credits-role">production</div>
              </div>
              <div className="credits-fin">FIN</div>
            </div>
          </div>
        )}

        {ended && (
          <div className="paywall">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26 }}>That's a wrap.</div>
            <button className="btn btn-primary btn-sm" onClick={restart}>
              ↻ Replay
            </button>
          </div>
        )}

        <div className="player-bar">
          <span style={{ width: `${overall * 100}%` }} />
        </div>
      </div>

      <div className="player-controls">
        <button className="btn btn-ghost btn-sm" onClick={togglePlay}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={toggleMute} title="Toggle score (m)">
          {muted ? "🔇 Score" : "🔊 Score"}
        </button>
        <span className="faint">
          {phase === "title"
            ? "Opening titles"
            : phase === "credits"
              ? "End credits"
              : `Scene ${i + 1} / ${scenes.length} · Act ${scene.act}`}
        </span>
        <div className="scene-dots">
          {scenes.map((_, idx) => (
            <i
              key={idx}
              className={phase === "scene" && idx === i ? "on" : ""}
              onClick={() => jumpToScene(idx)}
              title={`Scene ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
