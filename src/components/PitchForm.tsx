"use client";

import { useActionState } from "react";
import { createPitchAction } from "@/app/actions";
import { GENRES, RULES } from "@/lib/config";

const EXAMPLES = [
  "A melancholy sci-fi about a sentient render farm bargaining for its life.",
  "Coastal folk-horror: the tide returns everyone ever lost at sea.",
  "A heist told entirely in elevator rides between the same two floors.",
];

export function PitchForm() {
  const [state, formAction, pending] = useActionState(createPitchAction, null);

  return (
    <form action={formAction} className="panel" style={{ maxWidth: 680 }}>
      {state && !state.ok && <div className="form-error">{state.error}</div>}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input className="control" id="title" name="title" placeholder="The Last Render" maxLength={90} required />
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
          Tone, setting, palette, themes — the richer the prompt, the richer the film. Try:{" "}
          <i>"{EXAMPLES[0]}"</i>
        </span>
      </div>

      <button className="btn btn-primary btn-lg" type="submit" disabled={pending}>
        {pending ? "Submitting…" : `Submit pitch · needs ${RULES.GREENLIGHT_THRESHOLD} votes to greenlight`}
      </button>
    </form>
  );
}
