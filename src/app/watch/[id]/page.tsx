import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { RULES } from "@/lib/config";
import { runtime } from "@/lib/format";
import type { Scene, CastMember, Crew } from "@/lib/studio";
import { Player } from "@/components/Player";
import { Poster } from "@/components/Poster";
import { BuyTicketButton, TipForm, TicketPriceForm } from "@/components/MonetizeControls";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const pitch = await db.pitch.findUnique({ where: { id }, include: { movie: true } });
  if (!pitch?.movie) return { title: "Now Streaming" };
  return { title: pitch.title, description: pitch.movie.tagline };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const pitch = await db.pitch.findUnique({
    where: { id },
    include: { author: true, movie: true },
  });

  if (!pitch || !pitch.movie) notFound();
  const movie = pitch.movie;
  const scenes: Scene[] = JSON.parse(movie.scenesJson);
  const cast: CastMember[] = JSON.parse(movie.castJson || "[]");
  const crew: Crew = JSON.parse(movie.crewJson || "{}");

  const isDirector = user?.id === pitch.authorId;
  const hasViewed = user
    ? (await db.view.count({ where: { movieId: movie.id, userId: user.id } })) > 0
    : false;

  const canWatch = isDirector || hasViewed;
  const price = movie.ticketPrice;
  const affordable = !user || user.credits >= price;

  return (
    <>
      <div className="crumbs">
        <Link href="/now-streaming">Now Streaming</Link> / {pitch.title}
      </div>

      <div className="watch-grid">
        {/* Left: player / paywall */}
        <div style={{ minWidth: 0 }}>
          {canWatch ? (
            <Player
              title={pitch.title}
              tagline={movie.tagline}
              scenes={scenes}
              cast={cast}
              crew={crew}
              directorName={pitch.author.displayName}
            />
          ) : (
            <div className="player">
              <Poster svg={movie.posterSvg} className="player-stage" />
              <div className="paywall">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>
                  Buy a ticket to stream
                </div>
                <p className="muted" style={{ maxWidth: "36ch" }}>
                  {price === 0
                    ? "This film is free to watch."
                    : `${price} credits — ${Math.round(price * (1 - RULES.PLATFORM_FEE))} go straight to the director.`}
                </p>
                {user ? (
                  <BuyTicketButton movieId={movie.id} price={price} affordable={affordable} />
                ) : (
                  <Link href="/" className="btn btn-primary btn-lg">
                    Sign in to watch
                  </Link>
                )}
                {!affordable && (
                  <span className="faint" style={{ fontSize: 13 }}>
                    You have {user?.credits} credits.
                  </span>
                )}
              </div>
            </div>
          )}

          <h1 style={{ fontSize: 34, margin: "20px 0 4px" }}>{pitch.title}</h1>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)" }}>
            {movie.tagline}
          </p>
          <div className="pill-list" style={{ margin: "12px 0" }}>
            <span className="badge">{pitch.genre}</span>
            <span className="badge">{movie.rating}</span>
            <span className="badge">{runtime(movie.runtimeSec)}</span>
            <span className="badge">{scenes.length} scenes</span>
            <span className="badge score-badge">★ {movie.criticScore} critic score</span>
          </div>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.7, maxWidth: "64ch" }}>
            {movie.synopsis}
          </p>

          {cast.length > 0 && (
            <div className="credits-inline">
              <h3 className="subhead">Cast</h3>
              <div className="pill-list">
                {cast.map((c) => (
                  <span key={c.role} className="cast-chip">
                    <b>{c.actor}</b> <span className="faint">as {c.role}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="faint" style={{ fontSize: 13, marginTop: 16 }}>
            Directed &amp; produced by{" "}
            <Link href={`/u/${pitch.author.handle}`} className="link">
              @{pitch.author.handle}
            </Link>
          </p>
        </div>

        {/* Right: monetization rail */}
        <aside className="watch-rail">
          <div className="panel">
            <div className="row" style={{ gap: 22 }}>
              <div className="stat">
                <span className="n" style={{ color: "var(--green)" }}>
                  {movie.earnings}
                </span>
                <span className="l">Credits earned</span>
              </div>
              <div className="stat">
                <span className="n">{movie.viewCount}</span>
                <span className="l">Tickets sold</span>
              </div>
            </div>
          </div>

          {isDirector ? (
            <div className="panel">
              <h3 className="subhead">Director controls</h3>
              <p className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
                Set your ticket price. The platform keeps {Math.round(RULES.PLATFORM_FEE * 100)}%; the rest is yours.
              </p>
              <TicketPriceForm movieId={movie.id} price={price} />
            </div>
          ) : (
            user && (
              <div className="panel">
                <h3 className="subhead">Tip the director</h3>
                <TipForm movieId={movie.id} />
                <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                  Your balance: {user.credits} cr
                </p>
              </div>
            )
          )}

          <div className="panel">
            <h3 className="subhead">From the pitch</h3>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{pitch.logline}</p>
          </div>
        </aside>
      </div>
    </>
  );
}
