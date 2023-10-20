import { AuthenticateUser } from "./authentication.ts";
import { browser } from "./init.ts";

export interface ShopgoodwillFavoriteApiResult {
  message: string;
  status: boolean;
  type: null;
  primaryKey: null;
  isUnauthorized: boolean;
  data: ShopgoodwillFavorite[];
}

export interface ShopgoodwillFavorite {
  imageStatus: number;
  itemId: number;
  numBids: number;
  quantityWon: number;
  watchlistId: number;
  type: ShopgoodwillFavoriteType;
  discountedBuyNowPrice: number;
  discount: number;
  buyNowPrice: number;
  currentPrice: number;
  minimumBid: number;
  maxBid: null;
  isStock: boolean;
  imageServer: string;
  imageURL: string;
  notes: string;
  sellerName: string;
  title: string;
  endTime: Date;
  startTime: Date;
  catFullName: string;
  sellerId: number;
  itemPartNumber: null | string;
  itemQuantity: number;
  listingType: number;
}

export enum ShopgoodwillFavoriteType {
  Close = "Close",
  Open = "Open",
}

export const GetFavorites = async (): Promise<ShopgoodwillFavorite[]> => {
  await AuthenticateUser();
  try {
    console.log("Getting favorites");
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      request.continue();
    });
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("Favorite/GetAllFavoriteItemsByType") &&
        response.request().method() != "OPTIONS"
    );
    await page.goto("https://shopgoodwill.com/shopgoodwill/favorites");

    // console.log("Making request");

    const response = await responsePromise;

    // console.log(response);

    const result: ShopgoodwillFavoriteApiResult = await response.json();

    return result.data;
  } catch (error) {
    console.error(error);
    return [];
  }
};
