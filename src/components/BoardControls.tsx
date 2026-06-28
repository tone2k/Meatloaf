"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { GENRES } from "@/lib/config";

const SORTS = [
  { key: "hot", label: "🔥 Hot" },
  { key: "new", label: "✨ New" },
  { key: "top", label: "🏆 Top" },
];

export function BoardControls() {
  const router = useRouter();
  const params = useSearchParams();
  const sort = params.get("sort") ?? "hot";
  const genre = params.get("genre") ?? "";
  const q = params.get("q") ?? "";

  const update = useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      router.replace(`/?${sp.toString()}`, { scroll: false });
    },
    [params, router]
  );

  return (
    <div className="board-controls">
      <div className="tabs">
        {SORTS.map((s) => (
          <button
            key={s.key}
            className={`tab${sort === s.key ? " active" : ""}`}
            onClick={() => update({ sort: s.key })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="board-controls-right">
        <input
          className="control search"
          placeholder="Search pitches…"
          defaultValue={q}
          onChange={(e) => update({ q: e.target.value })}
        />
        <select className="control" value={genre} onChange={(e) => update({ genre: e.target.value })}>
          <option value="">All genres</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
