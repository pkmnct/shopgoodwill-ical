import { GetFavorites, ShopgoodwillFavorite } from "./favorites.ts";

import ical from "ical-generator";
import http from "node:http";

export const ServeIcal = async () => {
  if (!process.env.ICAL_UNIQUE_URL) {
    throw new Error("You must set ICAL_UNIQUE_URL");
  }

  const port = process.env.ICAL_PORT ? parseInt(process.env.ICAL_PORT) : 3000;
  const url = process.env.ICAL_URL || "127.0.0.1";

  http
    .createServer((req, res) => {
      if (req.url === "/" + process.env.ICAL_UNIQUE_URL) {
        console.log(`Valid incoming request, getting favorites...`);
        (async () => {
          const favorites: ShopgoodwillFavorite[] = await GetFavorites();
          const calendar = ical({
            name: `${process.env.SHOPGOODWILL_USERNAME} Shopgoodwill Favorites`,
          });

          favorites.forEach((favorite) => {
            calendar.createEvent({
              start: favorite.endTime,
              end: favorite.endTime,
              summary: favorite.title,
              description: `This item is ending on Goodwill at this time. Make sure to set a notification. The item is here: https://shopgoodwill.com/item/${favorite.itemId}`,
            });
          });

          calendar.serve(res);
        })();
      } else {
        console.log("Invalid incoming request", req.url, req.headers);
        res.destroy();
      }
    })
    .listen(port, url, () => {
      console.log(
        `iCal Feed Served at http://${url}:${port}/${process.env.ICAL_UNIQUE_URL}`
      );
    });
};
