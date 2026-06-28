"use client";

import { useState } from "react";
import { signInAction } from "@/app/actions";

export function SignInButton() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        Sign in
      </button>
    );
  }

  return (
    <form
      action={signInAction}
      className="inline-form"
      style={{ gap: 6 }}
      onSubmit={() => setOpen(false)}
    >
      <input
        className="control"
        name="handle"
        placeholder="handle"
        autoFocus
        style={{ width: 130 }}
        required
      />
      <button className="btn btn-primary btn-sm" type="submit">
        Enter studio
      </button>
    </form>
  );
}
