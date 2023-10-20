import puppeteer, { Browser } from "puppeteer";
import { AuthenticateUser } from "./authentication.ts";
import { ServeIcal } from "./ical.ts";
import dotenv from "dotenv";

dotenv.config();

export let browser: Browser;

(async () => {
  browser = await puppeteer.launch({ headless: "new" });
  await AuthenticateUser();

  await ServeIcal();
})();
