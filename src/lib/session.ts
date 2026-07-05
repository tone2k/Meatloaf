import { cookies } from "next/headers";
import { db } from "./db";
import { RULES } from "./config";

const COOKIE = "greenlight_uid";

/**
 * Lightweight identity: a signed-in user is whoever the session cookie points to.
 * No passwords — this is a studio sandbox. Accounts are created by handle.
 */
export async function getCurrentUser() {
  const jar = await cookies();
  const uid = jar.get(COOKIE)?.value;
  if (!uid) return null;
  return db.user.findUnique({ where: { id: uid } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

/** Sign in as an existing handle, or create a fresh account for it. */
export async function signInOrCreate(handleRaw: string, displayNameRaw?: string) {
  const handle = handleRaw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!handle) throw new Error("Pick a handle (letters, numbers, underscores).");

  let user = await db.user.findUnique({ where: { handle } });
  if (!user) {
    const displayName = (displayNameRaw?.trim() || handleRaw.trim() || handle).slice(0, 40);
    user = await db.user.create({
      data: { handle, displayName, credits: RULES.STARTING_CREDITS },
    });
    await db.transaction.create({
      data: {
        userId: user.id,
        amount: RULES.STARTING_CREDITS,
        kind: "GRANT",
        memo: "Welcome grant",
      },
    });
  }

  const jar = await cookies();
  jar.set(COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return user;
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
