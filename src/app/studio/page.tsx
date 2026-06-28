import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/config";
import { runtime, ago } from "@/lib/format";
import { Poster } from "@/components/Poster";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="empty" style={{ marginTop: 40 }}>
        <p>Sign in to open your studio.</p>
        <Link href="/" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
          Back to board
        </Link>
      </div>
    );
  }

  const [pitches, ledger] = await Promise.all([
    db.pitch.findMany({
      where: { authorId: user.id },
      include: { movie: true },
      orderBy: { createdAt: "desc" },
    }),
    db.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const released = pitches.filter((p) => p.movie);
  const totalEarnings = released.reduce((s, p) => s + (p.movie?.earnings ?? 0), 0);
  const totalViews = released.reduce((s, p) => s + (p.movie?.viewCount ?? 0), 0);

  return (
    <>
      <h1 style={{ fontSize: 34, margin: "28px 0 4px" }}>{user.displayName}'s Studio</h1>
      <p className="muted" style={{ marginBottom: 20 }}>@{user.handle}</p>

      <div className="panel">
        <div className="row" style={{ gap: 36 }}>
          <div className="stat">
            <span className="n" style={{ color: "var(--accent)" }}>{user.credits}</span>
            <span className="l">Wallet</span>
          </div>
          <div className="stat">
            <span className="n" style={{ color: "var(--green)" }}>{totalEarnings}</span>
            <span className="l">Earned as director</span>
          </div>
          <div className="stat">
            <span className="n">{released.length}</span>
            <span className="l">Films released</span>
          </div>
          <div className="stat">
            <span className="n">{totalViews}</span>
            <span className="l">Total tickets</span>
          </div>
        </div>
      </div>

      <div className="section-head">
        <h2>My pitches &amp; films</h2>
        <Link href="/pitch/new" className="btn btn-primary btn-sm">+ New pitch</Link>
      </div>

      {pitches.length === 0 ? (
        <div className="empty">You haven't pitched anything yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pitches.map((p) => {
            const href = p.movie ? `/watch/${p.id}` : `/pitch/${p.id}`;
            return (
              <Link
                key={p.id}
                href={href}
                className="panel"
                style={{ display: "flex", gap: 16, alignItems: "center" }}
              >
                {p.movie ? (
                  <Poster svg={p.movie.posterSvg} className="poster-mini" />
                ) : (
                  <div
                    className="poster-mini"
                    style={{ background: "var(--bg-elev)", border: "1px solid var(--border)" }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                    <span className={`badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                    <span className="genre-tag">{p.genre}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 19 }}>{p.title}</div>
                  <div className="faint" style={{ fontSize: 13 }}>
                    {p.movie
                      ? `${p.movie.viewCount} tickets · ${p.movie.earnings} cr earned · ${runtime(p.movie.runtimeSec)}`
                      : `${p.voteCount} votes · pitched ${ago(p.createdAt)}`}
                  </div>
                </div>
                <span className="faint">→</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="section-head">
        <h2>Wallet activity</h2>
      </div>
      <div className="panel ledger">
        {ledger.length === 0 ? (
          <p className="faint">No activity yet.</p>
        ) : (
          ledger.map((t) => (
            <div key={t.id} className="ledger-row">
              <span>
                <b style={{ color: "var(--text)" }}>{t.kind}</b> · {t.memo}
              </span>
              <span className={`amt ${t.amount >= 0 ? "pos" : "neg"}`}>
                {t.amount >= 0 ? "+" : ""}
                {t.amount} cr
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
