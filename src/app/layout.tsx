import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import { signOutAction } from "./actions";
import { SignInButton } from "@/components/SignInButton";

export const metadata: Metadata = {
  title: "Greenlight — Generative AI Movie Studio",
  description:
    "Pitch a movie. The crowd votes. The best pitch gets greenlit — its author becomes director, the film is generated, streamed, and monetized.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="brand">
              <span className="dot" />
              Greenlight
            </Link>
            <div className="nav-links">
              <Link href="/">Board</Link>
              <Link href="/now-streaming">Now Streaming</Link>
              {user && <Link href="/studio">My Studio</Link>}
            </div>
            <div className="nav-right">
              {user ? (
                <>
                  <span className="wallet">
                    @{user.handle} · <b>{user.credits} cr</b>
                  </span>
                  <Link href="/pitch/new" className="btn btn-primary btn-sm">
                    + Pitch
                  </Link>
                  <form action={signOutAction}>
                    <button className="btn btn-ghost btn-sm" type="submit">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <SignInButton />
              )}
            </div>
          </div>
        </nav>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
