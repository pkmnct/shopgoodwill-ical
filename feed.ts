import ical from "ical-generator";

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
    if (!(favorite.endTime instanceof Date) || Number.isNaN(favorite.endTime.getTime())) {
      throw new Error(
        `Item ${favorite.itemId} has no usable end time; shopgoodwill-ts-api 1.x or newer is required`
      );
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
