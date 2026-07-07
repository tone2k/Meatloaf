/**
 * Tunable rules of the studio economy.
 */
export const RULES = {
  /**
   * The "greenlight line" — votes a pitch needs to cross to be greenlit. Set high
   * on purpose: this is a competitive race, not five likes. Pitches climb a public
   * leaderboard and only the ones the crowd genuinely pushes over the line get made.
   */
  GREENLIGHT_THRESHOLD: 25,
  /** Credits every new account is granted. */
  STARTING_CREDITS: 100,
  /** Platform cut on each ticket/tip, as a fraction (rest goes to director). */
  PLATFORM_FEE: 0.1,
  /** Default ticket price a director can later change. */
  DEFAULT_TICKET_PRICE: 5,
  /** Allowed bounds for a director-set ticket price. */
  MIN_TICKET_PRICE: 0,
  MAX_TICKET_PRICE: 50,
  /**
   * Cost to generate a Teaser Trailer that showcases a pitch on the board.
   * Creator pays up front; it's fully refunded if the pitch gets greenlit.
   */
  TRAILER_COST: 20,
  /** How many scenes a teaser trailer contains. */
  TRAILER_SCENES: 3,
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
