"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInAction } from "@/app/actions";
import { useToast } from "./Toast";

export function SignInButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(signInAction, null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
    } else if (state && !state.ok) {
      toast(state.error, "error");
    }
  }, [state, router, toast]);

  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        Sign in
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-form" style={{ gap: 6 }}>
      <input
        className="control"
        name="handle"
        placeholder="your handle"
        autoFocus
        style={{ width: 130 }}
        required
        maxLength={20}
      />
      <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
        {pending ? "…" : "Enter studio"}
      </button>
    </form>
  );
}
