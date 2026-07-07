import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import { signOutAction } from "./actions";
import { SignInButton } from "@/components/SignInButton";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: {
    default: "Greenlight — Generative AI Movie Studio",
    template: "%s · Greenlight",
  },
  description:
    "Pitch a movie. The crowd votes. The best pitch gets greenlit — its author becomes director, the film is generated, streamed, and monetized.",
  applicationName: "Greenlight",
  openGraph: {
    title: "Greenlight — Generative AI Movie Studio",
    description:
      "Pitch a movie as a prompt. The crowd greenlights it. The studio engine makes it real.",
    type: "website",
  },
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
        <ToastProvider>
          <div className="filmgrain" aria-hidden />
          <nav className="nav">
            <div className="nav-inner">
              <Link href="/" className="brand">
                <span className="dot" />
                Greenlight
              </Link>
              <div className="nav-links">
                <Link href="/">Board</Link>
                <Link href="/leaderboard">Greenlight Race</Link>
                <Link href="/now-streaming">Streaming</Link>
                <Link href="/box-office">Box Office</Link>
                {user && <Link href="/studio">My Studio</Link>}
              </div>
              <div className="nav-right">
                {user ? (
                  <>
                    <Link href="/studio" className="wallet" title="Your wallet">
                      @{user.handle} · <b>{user.credits} cr</b>
                    </Link>
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
          <footer className="footer">
            <span>
              <span className="dot" /> Greenlight
            </span>
            <span className="faint">
              A generative AI movie studio · pitches become films when the crowd says yes
            </span>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
