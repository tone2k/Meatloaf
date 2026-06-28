"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RULES } from "@/lib/config";
import { getCurrentUser, requireUser, signInOrCreate, signOut } from "@/lib/session";
import { generateFilm } from "@/lib/studio";
import { payDirector } from "@/lib/economy";

// --- identity ------------------------------------------------------------------

export async function signInAction(formData: FormData) {
  const handle = String(formData.get("handle") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  await signInOrCreate(handle, displayName);
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  await signOut();
  revalidatePath("/", "layout");
}

// --- pitches -------------------------------------------------------------------

export async function createPitchAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim().slice(0, 90);
  const logline = String(formData.get("logline") ?? "").trim().slice(0, 240);
  const genre = String(formData.get("genre") ?? "").trim() || "Drama";
  const prompt = String(formData.get("prompt") ?? "").trim().slice(0, 2000);

  if (!title || !logline || !prompt) {
    throw new Error("Title, logline and prompt are all required.");
  }

  const pitch = await db.pitch.create({
    data: { title, logline, genre, prompt, authorId: user.id },
  });
  redirect(`/pitch/${pitch.id}`);
}

/**
 * Cast (or retract) a vote. Crossing the threshold auto-greenlights the pitch
 * and confers director/producer rights on its author.
 */
export async function voteAction(pitchId: string) {
  const user = await requireUser();

  await db.$transaction(async (tx) => {
    const pitch = await tx.pitch.findUniqueOrThrow({ where: { id: pitchId } });
    if (pitch.status !== "PITCHED") return; // voting closes at greenlight

    const existing = await tx.vote.findUnique({
      where: { pitchId_userId: { pitchId, userId: user.id } },
    });

    let voteCount: number;
    if (existing) {
      await tx.vote.delete({ where: { id: existing.id } });
      const updated = await tx.pitch.update({
        where: { id: pitchId },
        data: { voteCount: { decrement: 1 } },
      });
      voteCount = updated.voteCount;
    } else {
      await tx.vote.create({ data: { pitchId, userId: user.id } });
      const updated = await tx.pitch.update({
        where: { id: pitchId },
        data: { voteCount: { increment: 1 } },
      });
      voteCount = updated.voteCount;
    }

    if (voteCount >= RULES.GREENLIGHT_THRESHOLD) {
      await tx.pitch.update({
        where: { id: pitchId },
        data: { status: "GREENLIT", greenlitAt: new Date() },
      });
    }
  });

  revalidatePath("/");
  revalidatePath(`/pitch/${pitchId}`);
}

// --- production ----------------------------------------------------------------

/**
 * The director triggers the studio engine. Only the pitch author may do this,
 * and only once the pitch is greenlit.
 */
export async function generateMovieAction(pitchId: string) {
  const user = await requireUser();

  const pitch = await db.pitch.findUniqueOrThrow({ where: { id: pitchId } });
  if (pitch.authorId !== user.id) throw new Error("Only the director can start production.");
  if (pitch.status !== "GREENLIT") throw new Error("This pitch isn't greenlit.");

  // Mark in-production, then generate, then release.
  await db.pitch.update({ where: { id: pitchId }, data: { status: "GENERATING" } });

  const film = generateFilm({
    id: pitch.id,
    title: pitch.title,
    logline: pitch.logline,
    genre: pitch.genre,
    prompt: pitch.prompt,
  });

  await db.$transaction([
    db.movie.create({
      data: {
        pitchId: pitch.id,
        tagline: film.tagline,
        synopsis: film.synopsis,
        posterSvg: film.posterSvg,
        runtimeSec: film.runtimeSec,
        scenesJson: JSON.stringify(film.scenes),
        ticketPrice: RULES.DEFAULT_TICKET_PRICE,
      },
    }),
    db.pitch.update({ where: { id: pitchId }, data: { status: "RELEASED" } }),
  ]);

  revalidatePath("/");
  revalidatePath(`/pitch/${pitchId}`);
  redirect(`/watch/${pitchId}`);
}

export async function setTicketPriceAction(movieId: string, formData: FormData) {
  const user = await requireUser();
  const raw = Number(formData.get("ticketPrice"));
  const price = Math.max(
    RULES.MIN_TICKET_PRICE,
    Math.min(RULES.MAX_TICKET_PRICE, Math.round(isNaN(raw) ? 0 : raw))
  );

  const movie = await db.movie.findUniqueOrThrow({
    where: { id: movieId },
    include: { pitch: true },
  });
  if (movie.pitch.authorId !== user.id) throw new Error("Only the director sets the price.");

  await db.movie.update({ where: { id: movieId }, data: { ticketPrice: price } });
  revalidatePath(`/watch/${movie.pitchId}`);
}

// --- monetization --------------------------------------------------------------

/**
 * Buy a ticket and record a view. The director streams free; everyone else pays
 * the ticket price, which is split between the director and the platform.
 */
export async function buyTicketAction(movieId: string) {
  const user = await requireUser();

  const result = await db.$transaction(async (tx) => {
    const movie = await tx.movie.findUniqueOrThrow({
      where: { id: movieId },
      include: { pitch: true },
    });
    const isDirector = movie.pitch.authorId === user.id;
    const price = isDirector ? 0 : movie.ticketPrice;

    if (price > 0) {
      await payDirector(tx, {
        fromUserId: user.id,
        directorUserId: movie.pitch.authorId,
        movieId: movie.id,
        gross: price,
        kind: "TICKET",
        memo: movie.pitch.title,
      });
    }

    await tx.view.create({
      data: { movieId, userId: user.id, pricePaid: price },
    });
    await tx.movie.update({
      where: { id: movieId },
      data: { viewCount: { increment: 1 } },
    });
    return { pitchId: movie.pitchId };
  });

  revalidatePath(`/watch/${result.pitchId}`);
}

export async function tipAction(movieId: string, formData: FormData) {
  const user = await requireUser();
  const amount = Math.max(1, Math.min(1000, Math.round(Number(formData.get("amount")) || 0)));

  const result = await db.$transaction(async (tx) => {
    const movie = await tx.movie.findUniqueOrThrow({
      where: { id: movieId },
      include: { pitch: true },
    });
    if (movie.pitch.authorId === user.id) throw new Error("You can't tip your own film.");

    await payDirector(tx, {
      fromUserId: user.id,
      directorUserId: movie.pitch.authorId,
      movieId: movie.id,
      gross: amount,
      kind: "TIP",
      memo: movie.pitch.title,
    });
    await tx.tip.create({ data: { movieId, fromId: user.id, amount } });
    return { pitchId: movie.pitchId };
  });

  revalidatePath(`/watch/${result.pitchId}`);
}

// re-export for convenience in server components that need the current user
export { getCurrentUser };
