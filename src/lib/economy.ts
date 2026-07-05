import type { Prisma } from "@prisma/client";
import { RULES } from "./config";

/**
 * Split a gross payment into the director's net take and the platform fee.
 */
export function splitRevenue(gross: number) {
  const fee = Math.round(gross * RULES.PLATFORM_FEE);
  return { net: gross - fee, fee };
}

/**
 * Move `amount` of credits from a viewer to a director inside a transaction,
 * recording both ledger entries. `kind` is TICKET or TIP. Returns the net the
 * director received. Throws if the viewer cannot afford it.
 *
 * Designed to be called with an interactive-transaction client (tx).
 */
export async function payDirector(
  tx: Prisma.TransactionClient,
  opts: {
    fromUserId: string;
    directorUserId: string;
    movieId: string;
    gross: number;
    kind: "TICKET" | "TIP";
    memo: string;
  }
): Promise<number> {
  const { fromUserId, directorUserId, movieId, gross, kind, memo } = opts;

  if (gross > 0) {
    const payer = await tx.user.findUniqueOrThrow({ where: { id: fromUserId } });
    if (payer.credits < gross) {
      throw new Error(`Not enough credits — need ${gross}, have ${payer.credits}.`);
    }
    await tx.user.update({
      where: { id: fromUserId },
      data: { credits: { decrement: gross } },
    });
    await tx.transaction.create({
      data: { userId: fromUserId, amount: -gross, kind, memo },
    });
  }

  const { net } = splitRevenue(gross);

  // The director never pays themselves; if payer === director, gross was 0 anyway.
  if (net > 0 && directorUserId !== fromUserId) {
    await tx.user.update({
      where: { id: directorUserId },
      data: { credits: { increment: net } },
    });
    await tx.transaction.create({
      data: {
        userId: directorUserId,
        amount: net,
        kind: "PAYOUT",
        memo: `${kind === "TICKET" ? "Ticket" : "Tip"} payout · ${memo}`,
      },
    });
    await tx.movie.update({
      where: { id: movieId },
      data: { earnings: { increment: net } },
    });
  }

  return net;
}
