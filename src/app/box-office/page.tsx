import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Poster } from "@/components/Poster";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Box Office" };

export default async function BoxOfficePage() {
  const [topFilms, directorRows] = await Promise.all([
    db.movie.findMany({
      include: { pitch: { include: { author: true } } },
      orderBy: [{ earnings: "desc" }, { viewCount: "desc" }],
      take: 10,
    }),
    db.movie.findMany({
      include: { pitch: { include: { author: true } } },
    }),
  ]);

  // Aggregate director earnings + ticket counts across their films.
  const byDirector = new Map<
    string,
    { handle: string; name: string; earnings: number; tickets: number; films: number }
  >();
  for (const m of directorRows) {
    const a = m.pitch.author;
    const cur =
      byDirector.get(a.id) ?? { handle: a.handle, name: a.displayName, earnings: 0, tickets: 0, films: 0 };
    cur.earnings += m.earnings;
    cur.tickets += m.viewCount;
    cur.films += 1;
    byDirector.set(a.id, cur);
  }
  const topDirectors = [...byDirector.values()].sort((a, b) => b.earnings - a.earnings).slice(0, 8);

  const grossTotal = directorRows.reduce((s, m) => s + m.earnings, 0);
  const ticketTotal = directorRows.reduce((s, m) => s + m.viewCount, 0);

  return (
    <>
      <h1 className="page-title">Box Office</h1>
      <p className="muted" style={{ marginBottom: 22 }}>
        The studio's leaderboard — where the crowd's greenlights turn into earnings.
      </p>

      <div className="panel" style={{ marginBottom: 28 }}>
        <div className="row" style={{ gap: 40 }}>
          <div className="stat">
            <span className="n" style={{ color: "var(--green)" }}>{grossTotal}</span>
            <span className="l">Total gross (credits)</span>
          </div>
          <div className="stat">
            <span className="n">{ticketTotal}</span>
            <span className="l">Tickets sold</span>
          </div>
          <div className="stat">
            <span className="n">{directorRows.length}</span>
            <span className="l">Films released</span>
          </div>
        </div>
      </div>

      <div className="boxoffice-grid">
        <section>
          <h2 className="subhead-lg">Top-grossing films</h2>
          {topFilms.length === 0 ? (
            <div className="empty">No films released yet.</div>
          ) : (
            <ol className="chart">
              {topFilms.map((m, idx) => (
                <li key={m.id}>
                  <Link href={`/watch/${m.pitchId}`} className="chart-row">
                    <span className="chart-rank">{idx + 1}</span>
                    <Poster svg={m.posterSvg} className="poster-mini" />
                    <span className="chart-main">
                      <span className="chart-title">{m.pitch.title}</span>
                      <span className="faint" style={{ fontSize: 13 }}>
                        @{m.pitch.author.handle} · {m.viewCount} tickets · ★ {m.criticScore}
                      </span>
                    </span>
                    <span className="chart-amt">{m.earnings} cr</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <h2 className="subhead-lg">Top directors</h2>
          {topDirectors.length === 0 ? (
            <div className="empty">No directors yet.</div>
          ) : (
            <ol className="chart">
              {topDirectors.map((d, idx) => (
                <li key={d.handle}>
                  <Link href={`/u/${d.handle}`} className="chart-row">
                    <span className="chart-rank">{idx + 1}</span>
                    <span className="avatar">{d.name.charAt(0).toUpperCase()}</span>
                    <span className="chart-main">
                      <span className="chart-title">{d.name}</span>
                      <span className="faint" style={{ fontSize: 13 }}>
                        @{d.handle} · {d.films} film{d.films === 1 ? "" : "s"} · {d.tickets} tickets
                      </span>
                    </span>
                    <span className="chart-amt">{d.earnings} cr</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
