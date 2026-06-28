import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { RULES } from "@/lib/config";
import { runtime } from "@/lib/format";
import type { Scene } from "@/lib/studio";
import { Player } from "@/components/Player";
import { Poster } from "@/components/Poster";
import { buyTicketAction, tipAction, setTicketPriceAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  // `id` is the pitch id (stable, shareable). Movie hangs off it.
  const pitch = await db.pitch.findUnique({
    where: { id },
    include: { author: true, movie: true },
  });

  if (!pitch || !pitch.movie) notFound();
  const movie = pitch.movie;
  const scenes: Scene[] = JSON.parse(movie.scenesJson);

  const isDirector = user?.id === pitch.authorId;
  const hasViewed = user
    ? (await db.view.count({ where: { movieId: movie.id, userId: user.id } })) > 0
    : false;

  // The director always has access; everyone else needs a ticket (a View row).
  const canWatch = isDirector || hasViewed;
  const price = movie.ticketPrice;
  const affordable = !user || user.credits >= price;

  return (
    <>
      <div className="crumbs">
        <Link href="/now-streaming">Now Streaming</Link> / {pitch.title}
      </div>

      <div className="row" style={{ alignItems: "flex-start", marginTop: 6 }}>
        {/* Left: player / paywall */}
        <div style={{ flex: "1 1 560px", minWidth: 0 }}>
          {canWatch ? (
            <Player scenes={scenes} />
          ) : (
            <div className="player">
              <Poster svg={movie.posterSvg} className="player-stage" />
              <div className="paywall">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>
                  Buy a ticket to stream
                </div>
                <p className="muted" style={{ maxWidth: "36ch" }}>
                  {price === 0
                    ? "This film is free to watch."
                    : `${price} credits — ${Math.round(price * (1 - RULES.PLATFORM_FEE))} go straight to the director.`}
                </p>
                {user ? (
                  <form action={buyTicketAction.bind(null, movie.id)}>
                    <button className="btn btn-primary" disabled={!affordable}>
                      {price === 0 ? "▶ Watch free" : `▶ Buy ticket · ${price} cr`}
                    </button>
                  </form>
                ) : (
                  <Link href="/" className="btn btn-primary">
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
            <span className="badge">{runtime(movie.runtimeSec)}</span>
            <span className="badge">{scenes.length} scenes</span>
            <span className="badge">{movie.viewCount} views</span>
          </div>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.7, maxWidth: "64ch" }}>
            {movie.synopsis}
          </p>
          <p className="faint" style={{ fontSize: 13, marginTop: 14 }}>
            Directed &amp; produced by{" "}
            <Link href={`/u/${pitch.author.handle}`} style={{ color: "var(--text-dim)" }}>
              @{pitch.author.handle}
            </Link>
          </p>
        </div>

        {/* Right: monetization rail */}
        <div style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", gap: 16 }}>
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
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Director controls</h3>
              <p className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
                Set your ticket price. The platform keeps {Math.round(RULES.PLATFORM_FEE * 100)}%.
              </p>
              <form
                action={setTicketPriceAction.bind(null, movie.id)}
                className="inline-form"
              >
                <input
                  className="control"
                  name="ticketPrice"
                  type="number"
                  min={RULES.MIN_TICKET_PRICE}
                  max={RULES.MAX_TICKET_PRICE}
                  defaultValue={price}
                />
                <button className="btn btn-sm" type="submit">
                  Save
                </button>
              </form>
            </div>
          ) : (
            user && (
              <div className="panel">
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>Tip the director</h3>
                <form action={tipAction.bind(null, movie.id)} className="inline-form">
                  <input
                    className="control"
                    name="amount"
                    type="number"
                    min={1}
                    defaultValue={10}
                  />
                  <button className="btn btn-green btn-sm" type="submit">
                    Send tip
                  </button>
                </form>
                <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                  Your balance: {user.credits} cr
                </p>
              </div>
            )
          )}

          {canWatch && !isDirector && (
            <p className="toast" style={{ fontSize: 13 }}>
              ✓ Ticket purchased — enjoy the show.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
