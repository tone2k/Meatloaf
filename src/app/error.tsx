"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="state-screen">
      <div className="state-icon">🎬</div>
      <h1>Cut! Something broke on set.</h1>
      <p className="muted">An unexpected error interrupted the scene. You can try again.</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
        <button className="btn btn-primary" onClick={reset}>
          Retry
        </button>
        <a className="btn btn-ghost" href="/">
          Back to the board
        </a>
      </div>
    </div>
  );
}
