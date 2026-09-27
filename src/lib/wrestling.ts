/**
 * Wrestling live-channel engine.
 *
 * WWE's flagship weekly shows air on a fixed weekly schedule, so we can derive
 * whether a show is live (and when it airs next) with pure date math — no
 * database, no cron, no always-on scrapers.
 *
 * Streams are embedded via watch-wrestling.eu's documented, ad-free embed API:
 *   https://dailywrestling.cc/embed/{category}/{mm-dd-yyyy}/select-post-1/{source}/{button}
 *
 * `category` is the post's category tag lowercased, spaces removed, reversed.
 *   "WWE" -> "wwe" -> "eww"
 * `mm-dd-yyyy` is the broadcast date as it appears in the post title, which for
 * these shows is exactly the US-Eastern calendar date of the airing.
 */

export type ShowId = "raw" | "nxt" | "smackdown";

export interface WeeklyShow {
  id: ShowId;
  name: string;
  shortName: string;
  /** Day of week in US Eastern time. 0 = Sun ... 6 = Sat. */
  dayOfWeekEt: number;
  /** Broadcast start hour in US Eastern (24h). */
  startHourEt: number;
  /** Broadcast length in hours. */
  durationHours: number;
  /** Reversed, lowercased, space-stripped category for the embed API. */
  category: string;
  /** Tailwind accent classes used across the UI. */
  accent: {
    text: string;
    bg: string;
    ring: string;
    gradient: string;
  };
  tagline: string;
}

export const SHOWS: Record<ShowId, WeeklyShow> = {
  raw: {
    id: "raw",
    name: "WWE Monday Night Raw",
    shortName: "Raw",
    dayOfWeekEt: 1, // Monday
    startHourEt: 20, // 8:00 PM ET
    durationHours: 3,
    category: "eww", // "wwe" reversed
    accent: {
      text: "text-red-500",
      bg: "bg-red-600",
      ring: "ring-red-500",
      gradient: "from-red-700/40",
    },
    tagline: "The longest-running weekly episodic show in television history.",
  },
  nxt: {
    id: "nxt",
    name: "WWE NXT",
    shortName: "NXT",
    dayOfWeekEt: 2, // Tuesday
    startHourEt: 20,
    durationHours: 2,
    category: "eww",
    accent: {
      text: "text-yellow-400",
      bg: "bg-yellow-500",
      ring: "ring-yellow-400",
      gradient: "from-yellow-600/40",
    },
    tagline: "WWE's proving ground — the future of the industry.",
  },
  smackdown: {
    id: "smackdown",
    name: "WWE Friday Night SmackDown",
    shortName: "SmackDown",
    dayOfWeekEt: 5, // Friday
    startHourEt: 20,
    durationHours: 2,
    category: "eww",
    accent: {
      text: "text-blue-400",
      bg: "bg-blue-600",
      ring: "ring-blue-500",
      gradient: "from-blue-700/40",
    },
    tagline: "Friday nights belong to the blue brand.",
  },
};

export const SHOW_ORDER: ShowId[] = ["raw", "nxt", "smackdown"];

export function isShowId(value: string): value is ShowId {
  return value === "raw" || value === "nxt" || value === "smackdown";
}

export interface LiveProvider {
  id: string;
  /** Human label shown in the quality/server dropdown. */
  name: string;
  quality: "1080p60" | "1080p" | "720p" | "SD" | "auto";
  embedUrl: string;
  /** 1 = best/primary. Lower is tried first. */
  priority: number;
}

export type ShowPhase = "offair" | "preflight" | "live";

export interface ShowStatus {
  show: WeeklyShow;
  phase: ShowPhase;
  isLive: boolean;
  /** ISO string for the start of the current (if live) or next airing. */
  airDateIso: string;
  /** Broadcast date as mm-dd-yyyy in US Eastern (matches the post title). */
  broadcastDate: string;
  /** Milliseconds until air (0 when live or already started). */
  msUntilAir: number;
  providers: LiveProvider[];
}

/** Minutes before air time when we start resolving/offering streams. */
const PREFLIGHT_MINUTES = 20;

const ET_TIME_ZONE = "America/New_York";

interface EtParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun ... 6 = Sat
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Break an instant into US-Eastern wall-clock parts (DST-correct via Intl). */
function getEtParts(date: Date): EtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  // Intl can emit "24" at midnight in some runtimes; normalize to 0.
  if (hour === 24) hour = 0;
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour,
    minute: parseInt(get("minute"), 10),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** Offset (in minutes) to add to UTC to get US-Eastern time, e.g. -240 in EDT. */
function etOffsetMinutes(date: Date): number {
  const et = getEtParts(date);
  // Reconstruct the ET wall clock as if it were UTC, then diff from the real
  // instant to recover the offset (rounded to the nearest minute).
  const asUtc = Date.UTC(et.year, et.month - 1, et.day, et.hour, et.minute);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Build the UTC instant for a given ET calendar date + hour. */
function etWallToInstant(
  year: number,
  month1to12: number,
  day: number,
  hour: number
): Date {
  // First guess assuming the ET wall time is UTC.
  const guess = new Date(Date.UTC(year, month1to12 - 1, day, hour, 0, 0));
  // Correct using the ET offset at that instant (handles EST/EDT).
  const offset = etOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60000);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** mm-dd-yyyy in US Eastern for a given instant. */
function etBroadcastDate(instant: Date): string {
  const et = getEtParts(instant);
  return `${pad2(et.month)}-${pad2(et.day)}-${et.year}`;
}

const EMBED_BASE =
  process.env.NEXT_PUBLIC_WRESTLING_EMBED_BASE ?? "https://dailywrestling.cc/embed";

/**
 * Candidate provider slots offered to the player, in priority order. The embed
 * API's {source}/{button} indices map to the site's own server headings; the
 * first two are the site-hosted VidFrame variants (most reliable), followed by
 * mirror hosts. The client player probes/fails over between them.
 */
const PROVIDER_SLOTS: Array<{
  source: number;
  button: number;
  name: string;
  quality: LiveProvider["quality"];
}> = [
  { source: 1, button: 1, name: "Stream 1 · VidFrame", quality: "1080p60" },
  { source: 2, button: 1, name: "Stream 2 · VidFrame", quality: "720p" },
  { source: 3, button: 1, name: "Stream 3 · Mirror", quality: "1080p" },
  { source: 4, button: 1, name: "Stream 4 · Mirror", quality: "auto" },
  { source: 5, button: 1, name: "Stream 5 · Mirror", quality: "auto" },
];

function buildProviders(show: WeeklyShow, broadcastDate: string): LiveProvider[] {
  const base = EMBED_BASE.replace(/\/$/, "");
  return PROVIDER_SLOTS.map((slot, idx) => ({
    id: `${show.id}-${slot.source}-${slot.button}`,
    name: slot.name,
    quality: slot.quality,
    priority: idx + 1,
    embedUrl: `${base}/${show.category}/${broadcastDate}/select-post-1/${slot.source}/${slot.button}`,
  }));
}

/**
 * Compute a show's live status and (when live/preflight) its stream providers.
 * Pure function of `now`, so it's safe to call on the server per-request.
 */
export function getShowStatus(showId: ShowId, now: Date = new Date()): ShowStatus {
  const show = SHOWS[showId];
  const et = getEtParts(now);

  // Find the most recent airing start on/before `now`, then the next one.
  // Because all shows air and end within the same ET calendar day, we only
  // need day-of-week + hour comparisons.
  const dayDiffToThisWeek = (et.weekday - show.dayOfWeekEt + 7) % 7;

  // The airing that started most recently (could be today or earlier this week).
  const startedInstantThisWeek = etWallToInstant(
    et.year,
    et.month,
    et.day - dayDiffToThisWeek,
    show.startHourEt
  );

  const durationMs = show.durationHours * 3600_000;
  const endThisWeek = new Date(startedInstantThisWeek.getTime() + durationMs);

  let airStart: Date;
  if (now < endThisWeek) {
    // This week's airing hasn't finished yet — it's the relevant one.
    airStart = startedInstantThisWeek;
  } else {
    // Already ended; the relevant airing is next week.
    airStart = new Date(startedInstantThisWeek.getTime() + 7 * 86_400_000);
  }

  const airEnd = new Date(airStart.getTime() + durationMs);
  const preflightStart = new Date(airStart.getTime() - PREFLIGHT_MINUTES * 60_000);

  let phase: ShowPhase;
  if (now >= airStart && now < airEnd) {
    phase = "live";
  } else if (now >= preflightStart && now < airStart) {
    phase = "preflight";
  } else {
    phase = "offair";
  }

  const broadcastDate = etBroadcastDate(airStart);
  const providers =
    phase === "offair" ? [] : buildProviders(show, broadcastDate);

  return {
    show,
    phase,
    isLive: phase === "live",
    airDateIso: airStart.toISOString(),
    broadcastDate,
    msUntilAir: Math.max(0, airStart.getTime() - now.getTime()),
    providers,
  };
}

/** Status for all shows, ordered Raw → NXT → SmackDown. */
export function getAllShowStatuses(now: Date = new Date()): ShowStatus[] {
  return SHOW_ORDER.map((id) => getShowStatus(id, now));
}

/**
 * Pick the show to spotlight in the hub hero: any live show first, otherwise
 * the one airing soonest.
 */
export function getFeaturedStatus(statuses: ShowStatus[]): ShowStatus {
  const live = statuses.find((s) => s.isLive);
  if (live) return live;
  return [...statuses].sort((a, b) => a.msUntilAir - b.msUntilAir)[0];
}
