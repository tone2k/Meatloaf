"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RULES } from "@/lib/config";
import { getCurrentUser, requireUser, signInOrCreate, signOut } from "@/lib/session";
import { generateFilm, generateTrailer } from "@/lib/studio";
import { payDirector, chargeCredits, grantCredits } from "@/lib/economy";
import { ActionResult, ok, fail } from "@/lib/types";
import {
  ValidationError,
  parseHandle,
  parsePitch,
  parseTicketPrice,
  parseTipAmount,
} from "@/lib/validation";

/** Convert known errors into a safe ActionResult; unknown ones become generic. */
async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message);
    if (e instanceof Error && e.message === "Not signed in") {
      return fail("Please sign in to do that.");
    }
    if (e instanceof Error && e.message) return fail(e.message);
    return fail("Something went wrong. Please try again.");
  }
}

// --- identity ------------------------------------------------------------------

export async function signInAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return guard(async () => {
    const handle = parseHandle(String(formData.get("handle") ?? ""));
    await signInOrCreate(handle, String(formData.get("displayName") ?? ""));
    revalidatePath("/", "layout");
    return ok();
  });
}

export async function signOutAction() {
  await signOut();
  revalidatePath("/", "layout");
}

// --- pitches -------------------------------------------------------------------

export async function createPitchAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const result = await guard<{ id: string }>(async () => {
    const user = await requireUser();
    const input = parsePitch(formData);
    const pitch = await db.pitch.create({ data: { ...input, authorId: user.id } });
    revalidatePath("/");
    revalidatePath("/leaderboard");
    return ok({ id: pitch.id });
  });

  // redirect() throws NEXT_REDIRECT — keep it outside guard() so it isn't caught.
  if (result.ok && result.data) redirect(`/pitch/${result.data.id}`);
  return result.ok ? ok() : result;
}

export interface VoteState {
  voteCount: number;
  status: string;
  greenlit: boolean; // true only on the transition that crosses the threshold
}

/**
 * Cast (or retract) a vote. Crossing the threshold auto-greenlights the pitch
 * and confers director/producer rights on its author.
 */
export async function voteAction(pitchId: string): Promise<ActionResult<VoteState>> {
  return guard<VoteState>(async () => {
    const user = await requireUser();

    const state = await db.$transaction(async (tx) => {
      const pitch = await tx.pitch.findUniqueOrThrow({ where: { id: pitchId } });
      if (pitch.authorId === user.id) {
        throw new ValidationError("You can't vote for your own pitch — the crowd decides.");
      }
      if (pitch.status !== "PITCHED") {
        return { voteCount: pitch.voteCount, status: pitch.status, greenlit: false };
      }

      const existing = await tx.vote.findUnique({
        where: { pitchId_userId: { pitchId, userId: user.id } },
      });

      let voteCount: number;
      if (existing) {
        await tx.vote.delete({ where: { id: existing.id } });
        voteCount = (
          await tx.pitch.update({ where: { id: pitchId }, data: { voteCount: { decrement: 1 } } })
        ).voteCount;
      } else {
        await tx.vote.create({ data: { pitchId, userId: user.id } });
        voteCount = (
          await tx.pitch.update({ where: { id: pitchId }, data: { voteCount: { increment: 1 } } })
        ).voteCount;
      }

      let status: string = pitch.status;
      let greenlit = false;
      if (voteCount >= RULES.GREENLIGHT_THRESHOLD) {
        await tx.pitch.update({
          where: { id: pitchId },
          data: { status: "GREENLIT", greenlitAt: new Date() },
        });
        status = "GREENLIT";
        greenlit = true;

        // Trailer upsell is refunded when the pitch is greenlit (creator's boost
        // paid off). This block runs exactly once — the status guard above stops
        // any further votes from re-entering it.
        if (pitch.trailerJson) {
          await grantCredits(tx, {
            userId: pitch.authorId,
            amount: RULES.TRAILER_COST,
            kind: "REFUND",
            memo: `Teaser refund — greenlit! · ${pitch.title}`,
          });
        }
      }
      return { voteCount, status, greenlit };
    });

    revalidatePath("/");
    revalidatePath("/leaderboard");
    revalidatePath(`/pitch/${pitchId}`);
    return ok(state);
  });
}

/**
 * Buy a Teaser Trailer for your own pitch (an upsell). The creator pays up front;
 * the credits are refunded automatically if the pitch is later greenlit.
 */
export async function generateTrailerAction(pitchId: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireUser();
    const pitch = await db.pitch.findUniqueOrThrow({ where: { id: pitchId } });
    if (pitch.authorId !== user.id) throw new ValidationError("Only the creator can add a teaser.");
    if (pitch.status !== "PITCHED") throw new ValidationError("Teasers are for pitches still in the race.");
    if (pitch.trailerJson) throw new ValidationError("This pitch already has a teaser.");

    const trailer = generateTrailer(
      { id: pitch.id, title: pitch.title, logline: pitch.logline, genre: pitch.genre, prompt: pitch.prompt },
      RULES.TRAILER_SCENES
    );

    await db.$transaction(async (tx) => {
      await chargeCredits(tx, {
        userId: user.id,
        amount: RULES.TRAILER_COST,
        kind: "TRAILER",
        memo: `Teaser trailer · ${pitch.title}`,
      });
      await tx.pitch.update({ where: { id: pitchId }, data: { trailerJson: JSON.stringify(trailer) } });
    });

    revalidatePath("/");
    revalidatePath("/leaderboard");
    revalidatePath(`/pitch/${pitchId}`);
    return ok();
  });
}

// --- production ----------------------------------------------------------------

/**
 * The director triggers the studio engine. Only the pitch author may do this,
 * and only once the pitch is greenlit. Redirects to the finished film.
 */
export async function generateMovieAction(pitchId: string): Promise<ActionResult> {
  const result = await guard(async () => {
    const user = await requireUser();

    const pitch = await db.pitch.findUniqueOrThrow({ where: { id: pitchId } });
    if (pitch.authorId !== user.id) throw new ValidationError("Only the director can start production.");
    if (pitch.status === "RELEASED") throw new ValidationError("This film is already released.");
    if (pitch.status !== "GREENLIT") throw new ValidationError("This pitch isn't greenlit yet.");

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
          castJson: JSON.stringify(film.cast),
          crewJson: JSON.stringify(film.crew),
          rating: film.rating,
          criticScore: film.criticScore,
          ticketPrice: RULES.DEFAULT_TICKET_PRICE,
        },
      }),
      db.pitch.update({ where: { id: pitchId }, data: { status: "RELEASED" } }),
    ]);

    revalidatePath("/");
    revalidatePath("/leaderboard");
    revalidatePath(`/pitch/${pitchId}`);
    return ok();
  });

  if (result.ok) redirect(`/watch/${pitchId}`);
  return result;
}

export async function setTicketPriceAction(
  movieId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireUser();
    const price = parseTicketPrice(formData);
    const movie = await db.movie.findUniqueOrThrow({
      where: { id: movieId },
      include: { pitch: true },
    });
    if (movie.pitch.authorId !== user.id) throw new ValidationError("Only the director sets the price.");
    await db.movie.update({ where: { id: movieId }, data: { ticketPrice: price } });
    revalidatePath(`/watch/${movie.pitchId}`);
    return ok();
  });
}

// --- monetization --------------------------------------------------------------

/**
 * Buy a ticket and record a view. The director streams free; everyone else pays
 * the ticket price, split between the director and the platform.
 */
export async function buyTicketAction(movieId: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireUser();
    const pitchId = await db.$transaction(async (tx) => {
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
      await tx.view.create({ data: { movieId, userId: user.id, pricePaid: price } });
      await tx.movie.update({ where: { id: movieId }, data: { viewCount: { increment: 1 } } });
      return movie.pitchId;
    });
    revalidatePath(`/watch/${pitchId}`);
    return ok();
  });
}

export async function tipAction(
  movieId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireUser();
    const amount = parseTipAmount(formData);
    const pitchId = await db.$transaction(async (tx) => {
      const movie = await tx.movie.findUniqueOrThrow({
        where: { id: movieId },
        include: { pitch: true },
      });
      if (movie.pitch.authorId === user.id) throw new ValidationError("You can't tip your own film.");
      await payDirector(tx, {
        fromUserId: user.id,
        directorUserId: movie.pitch.authorId,
        movieId: movie.id,
        gross: amount,
        kind: "TIP",
        memo: movie.pitch.title,
      });
      await tx.tip.create({ data: { movieId, fromId: user.id, amount } });
      return movie.pitchId;
    });
    revalidatePath(`/watch/${pitchId}`);
    return ok();
  });
}

export { getCurrentUser };
