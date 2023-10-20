import { GetFavorites, ShopgoodwillFavorite } from "./favorites.ts";

import ical from "ical-generator";
import http from "node:http";

export const ServeIcal = async () => {
  http
    .createServer((req, res) => {
      (async () => {
        console.log("Incoming request");
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
    })
    .listen(3000, "127.0.0.1", () => {
      console.log("Server running at http://127.0.0.1:3000/");
    });
};
