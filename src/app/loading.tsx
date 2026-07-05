export default function Loading() {
  return (
    <div className="state-screen">
      <div className="loader-reel" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        Loading the studio…
      </p>
    </div>
  );
}
