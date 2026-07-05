import Link from "next/link";

export default function NotFound() {
  return (
    <div className="state-screen">
      <div className="state-icon">🔍</div>
      <h1>This scene was left on the cutting-room floor.</h1>
      <p className="muted">The page you're looking for isn't here.</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
        <Link className="btn btn-primary" href="/">
          Back to the board
        </Link>
        <Link className="btn btn-ghost" href="/now-streaming">
          Browse what's streaming
        </Link>
      </div>
    </div>
  );
}
