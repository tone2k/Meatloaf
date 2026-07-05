import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { RULES } from "@/lib/config";
import { PitchForm } from "@/components/PitchForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pitch a movie" };

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
      <h1 className="page-title">Pitch a movie</h1>
      <p className="muted" style={{ marginBottom: 24, maxWidth: "60ch" }}>
        Write it like a one-line elevator pitch plus the generative prompt that defines its world.
        If it reaches <b style={{ color: "var(--green)" }}>{RULES.GREENLIGHT_THRESHOLD} votes</b>,
        it's greenlit and you direct it.
      </p>
      <PitchForm />
    </>
  );
}
