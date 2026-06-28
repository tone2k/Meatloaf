"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#07070b", color: "#f4f4f8", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "120px auto", textAlign: "center", padding: 20 }}>
          <h1 style={{ fontFamily: "Georgia, serif" }}>The reel snapped.</h1>
          <p style={{ color: "#a0a0b0" }}>A fatal error stopped the studio. Try reloading.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              background: "#ffd54a",
              color: "#1a1500",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
