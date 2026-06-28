"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene } from "@/lib/studio";

/**
 * The "stream": plays generated scenes back-to-back. Each scene is a palette
 * gradient with a slow ken-burns drift, its heading, action line, and dialogue.
 * It's a stand-in for rendered video that fulfils the same Scene[] contract a
 * real video backend would.
 */
export function Player({ scenes }: { scenes: Scene[] }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const startedAt = useRef<number>(0);
  const elapsedBefore = useRef<number>(0);

  const scene = scenes[i];
  const durationMs = scene.durationSec * 1000;

  useEffect(() => {
    if (!playing) return;
    startedAt.current = performance.now() - elapsedBefore.current;

    const tick = (now: number) => {
      const elapsed = now - startedAt.current;
      const p = Math.min(elapsed / durationMs, 1);
      setProgress(p);
      if (p >= 1) {
        elapsedBefore.current = 0;
        if (i < scenes.length - 1) {
          setI(i + 1);
        } else {
          setPlaying(false);
        }
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      elapsedBefore.current = performance.now() - startedAt.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing]);

  function jump(to: number) {
    elapsedBefore.current = 0;
    setProgress(0);
    setI(to);
    setPlaying(true);
  }

  const ended = !playing && i === scenes.length - 1 && progress >= 1;

  return (
    <div>
      <div className="player">
        <div
          className="player-stage"
          style={{
            background: `linear-gradient(160deg, ${scene.palette.from}, ${scene.palette.to})`,
          }}
        >
          <div
            className="kenburns"
            style={{
              background: `radial-gradient(circle at 50% 35%, ${scene.palette.accent}55, transparent 60%)`,
            }}
          />
          <div className="scene-shot">{scene.shot}</div>
          <div style={{ position: "relative" }}>
            <div className="scene-heading">{scene.heading}</div>
            <div className="scene-action">{scene.action}</div>
            {scene.dialogue && (
              <div className="scene-dialogue">
                <span className="speaker">{scene.dialogue.speaker}</span>“{scene.dialogue.line}”
              </div>
            )}
          </div>
        </div>

        {ended && (
          <div className="paywall">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26 }}>Fin.</div>
            <button className="btn btn-primary btn-sm" onClick={() => jump(0)}>
              ↻ Replay
            </button>
          </div>
        )}

        <div className="player-bar">
          <span
            style={{
              width: `${((i + progress) / scenes.length) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="player-controls">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <span className="faint">
          Scene {i + 1} / {scenes.length}
        </span>
        <div className="scene-dots">
          {scenes.map((_, idx) => (
            <i
              key={idx}
              className={idx === i ? "on" : ""}
              onClick={() => jump(idx)}
              title={`Scene ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
