import ical from "ical-generator";
import { ShopgoodwillAuthError } from "shopgoodwill-ts-api";

/** The parts of a favorite the calendar needs. */
export interface FeedFavorite {
  itemId: number;
  title: string;
  /** A real instant: shopgoodwill-ts-api 1.x converts ShopGoodwill's Pacific wall-clock strings. */
  endTime: Date | string;
}

/**
 * No calendar-wide timezone on purpose: with one set, ical-generator writes
 * Date values as floating times (and adds a non-standard X-WR-TIMEZONE that
 * only some clients honour). Without it they are written as UTC instants,
 * which every calendar app shows correctly wherever its owner is.
 */
export function buildCalendar(favorites: FeedFavorite[]): string {
  const calendar = ical({ name: "ShopGoodwill Favorites" });

  for (const favorite of favorites) {
    // An offset-less string would be read in this server's timezone (UTC in the
    // container), which is wrong by hours. shopgoodwill-ts-api 1.x returns Dates.
    if (!(favorite.endTime instanceof Date)) {
      throw new Error(
        `Item ${favorite.itemId} has a non-Date end time; shopgoodwill-ts-api 1.x or newer is required`
      );
    }
    // One item with an unreadable time should not take the whole feed down
    if (Number.isNaN(favorite.endTime.getTime())) {
      console.warn(`Skipping item ${favorite.itemId}: unreadable end time`);
      continue;
    }
    calendar.createEvent({
      // A stable id lets calendar apps update an event instead of duplicating it
      id: `shopgoodwill-${favorite.itemId}`,
      start: favorite.endTime,
      end: favorite.endTime,
      summary: favorite.title,
      description: `This item is ending on Goodwill at this time. Make sure to set a notification. The item is here: https://shopgoodwill.com/item/${favorite.itemId}`,
    });
  }

  return calendar.toString();
}

export const DEFAULT_CACHE_SECONDS = 300;

/**
 * ICAL_CACHE_SECONDS as a number. Anything that is not a number of seconds
 * (zero or more) falls back to the default with a warning: a NaN here would
 * silently switch the cache off and send every request to ShopGoodwill.
 */
export function cacheSecondsFrom(raw: string | undefined): number {
  const text = raw?.trim();
  if (!text) {
    return DEFAULT_CACHE_SECONDS;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    console.warn(
      `ICAL_CACHE_SECONDS must be a number of seconds (got ${JSON.stringify(text)}); using ${DEFAULT_CACHE_SECONDS}.`
    );
    return DEFAULT_CACHE_SECONDS;
  }
  return value;
}

/** The login request itself was refused: the stored credentials are wrong (or blocked). */
export class LoginRefusedError extends Error {
  constructor(cause: unknown) {
    super("ShopGoodwill refused the login", { cause });
    this.name = "LoginRefusedError";
  }
}

/** The two client calls a feed build makes. */
export interface FeedApi {
  authenticate: () => Promise<unknown>;
  get_favorites: (type: "all") => Promise<FeedFavorite[]>;
}

/**
 * Signs in if needed and builds the calendar. Only an auth error from
 * `authenticate()` is a refused login (it reuses a valid token and otherwise
 * logs in, so that is the login request answering no). The library raises the
 * same class for any 401 or 403, so one from the favorites request is left as
 * it is: the credentials may be fine and the next attempt signs in again.
 */
export async function buildFeed(api: FeedApi): Promise<string> {
  try {
    await api.authenticate();
  } catch (error) {
    if (error instanceof ShopgoodwillAuthError) {
      throw new LoginRefusedError(error);
    }
    throw error;
  }
  return buildCalendar(await api.get_favorites("all"));
}
