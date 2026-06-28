/**
 * Tiny, dependency-free validation helpers. Each validator returns either a
 * cleaned value or throws a `ValidationError` whose message is safe to show.
 */

import { GENRES, RULES } from "./config";

export class ValidationError extends Error {}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function requireText(value: string, label: string, min: number, max: number): string {
  const v = value.trim();
  if (v.length < min) throw new ValidationError(`${label} must be at least ${min} characters.`);
  if (v.length > max) throw new ValidationError(`${label} must be ${max} characters or fewer.`);
  return v;
}

export interface PitchInput {
  title: string;
  logline: string;
  genre: string;
  prompt: string;
}

export function parsePitch(formData: FormData): PitchInput {
  const title = requireText(str(formData, "title"), "Title", 2, 90);
  const logline = requireText(str(formData, "logline"), "Logline", 10, 240);
  const prompt = requireText(str(formData, "prompt"), "Prompt", 20, 2000);
  const genreRaw = str(formData, "genre").trim();
  const genre = (GENRES as readonly string[]).includes(genreRaw) ? genreRaw : "Drama";
  return { title, logline, genre, prompt };
}

export function parseHandle(raw: string): string {
  const handle = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (handle.length < 2) throw new ValidationError("Handle needs at least 2 letters or numbers.");
  if (handle.length > 20) throw new ValidationError("Handle must be 20 characters or fewer.");
  return handle;
}

export function parseTicketPrice(formData: FormData): number {
  const raw = Number(str(formData, "ticketPrice"));
  if (!Number.isFinite(raw)) throw new ValidationError("Enter a valid price.");
  const n = Math.round(raw);
  if (n < RULES.MIN_TICKET_PRICE || n > RULES.MAX_TICKET_PRICE) {
    throw new ValidationError(
      `Ticket price must be between ${RULES.MIN_TICKET_PRICE} and ${RULES.MAX_TICKET_PRICE} credits.`
    );
  }
  return n;
}

export function parseTipAmount(formData: FormData): number {
  const raw = Number(str(formData, "amount"));
  if (!Number.isFinite(raw)) throw new ValidationError("Enter a valid tip amount.");
  const n = Math.round(raw);
  if (n < 1) throw new ValidationError("Tip must be at least 1 credit.");
  if (n > 1000) throw new ValidationError("Tip can't exceed 1000 credits.");
  return n;
}
