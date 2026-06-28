"use client";

import { useEffect, useState } from "react";

/**
 * The "greenlight moment" — a brief, celebratory overlay shown the instant a
 * pitch crosses the vote threshold. Procedural confetti, no assets.
 */
export function Celebration({
  show,
  title,
  onDone,
}: {
  show: boolean;
  title: string;
  onDone: () => void;
}) {
  const [pieces] = useState(() =>
    Array.from({ length: 80 }, (_, idx) => ({
      id: idx,
      left: (idx * 37) % 100,
      delay: (idx % 10) * 0.12,
      dur: 1.8 + ((idx * 7) % 14) / 10,
      color: ["#3ddc84", "#ffd54a", "#57b6ff", "#ff5470", "#b794f6"][idx % 5],
      size: 6 + ((idx * 3) % 8),
      rot: (idx * 53) % 360,
    }))
  );

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div className="celebration" role="dialog" aria-label="Pitch greenlit">
      <div className="confetti">
        {pieces.map((p) => (
          <span
            key={p.id}
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              transform: `rotate(${p.rot}deg)`,
            }}
          />
        ))}
      </div>
      <div className="celebration-card">
        <div className="celebration-kicker">★ GREENLIT ★</div>
        <h2 className="celebration-title">{title}</h2>
        <p className="celebration-sub">
          The crowd said yes. You're the director now — roll camera.
        </p>
      </div>
    </div>
  );
}
