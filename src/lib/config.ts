/**
 * Tunable rules of the studio economy.
 */
export const RULES = {
  /** Votes a pitch needs before it is auto-greenlit. */
  GREENLIGHT_THRESHOLD: 5,
  /** Credits every new account is granted. */
  STARTING_CREDITS: 100,
  /** Platform cut on each ticket/tip, as a fraction (rest goes to director). */
  PLATFORM_FEE: 0.1,
  /** Default ticket price a director can later change. */
  DEFAULT_TICKET_PRICE: 5,
  /** Allowed bounds for a director-set ticket price. */
  MIN_TICKET_PRICE: 0,
  MAX_TICKET_PRICE: 50,
} as const;

export const STATUS_LABEL: Record<string, string> = {
  PITCHED: "In Development",
  GREENLIT: "Greenlit",
  GENERATING: "In Production",
  RELEASED: "Now Streaming",
};

export const GENRES = [
  "Sci-Fi",
  "Horror",
  "Thriller",
  "Drama",
  "Comedy",
  "Fantasy",
  "Action",
  "Noir",
  "Documentary",
  "Animation",
] as const;
