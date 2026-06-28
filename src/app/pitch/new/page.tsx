import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { GENRES, RULES } from "@/lib/config";
import { createPitchAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NewPitchPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="empty" style={{ marginTop: 40 }}>
        <p>Sign in with any handle to pitch a film.</p>
        <Link href="/" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
          Back to board
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="crumbs">
        <Link href="/">Board</Link> / New pitch
      </div>
      <h1 style={{ fontSize: 34, margin: "10px 0 6px" }}>Pitch a movie</h1>
      <p className="muted" style={{ marginBottom: 24, maxWidth: "60ch" }}>
        Write it like a one-line elevator pitch plus the generative prompt that defines its world.
        If it reaches <b style={{ color: "var(--green)" }}>{RULES.GREENLIGHT_THRESHOLD} votes</b>,
        it's greenlit and you direct it.
      </p>

      <form action={createPitchAction} className="panel" style={{ maxWidth: 680 }}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            className="control"
            id="title"
            name="title"
            placeholder="The Last Render"
            maxLength={90}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="genre">Genre</label>
          <select className="control" id="genre" name="genre" defaultValue="Sci-Fi">
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="logline">Logline</label>
          <input
            className="control"
            id="logline"
            name="logline"
            placeholder="A one-sentence hook that makes people want to vote."
            maxLength={240}
            required
          />
          <span className="hint">One punchy sentence — this is what voters see on the board.</span>
        </div>

        <div className="field">
          <label htmlFor="prompt">Generative prompt</label>
          <textarea
            className="control"
            id="prompt"
            name="prompt"
            placeholder="Describe the world, tone, palette, and themes. This drives the studio engine."
            maxLength={2000}
            required
          />
          <span className="hint">
            Tone, setting, palette, themes — the richer the prompt, the richer the film.
          </span>
        </div>

        <button className="btn btn-primary" type="submit">
          Submit pitch to the board
        </button>
      </form>
    </>
  );
}
