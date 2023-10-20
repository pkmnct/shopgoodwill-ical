import { browser } from "./init.ts";

export interface UserAuth {
  userName: string;
  password: string;
}

export const AuthenticateUser = async (): Promise<void> => {
  console.log("Authenticating User");
  const page = await browser.newPage();

  if (
    !process.env.SHOPGOODWILL_USERNAME ||
    !process.env.SHOPGOODWILL_PASSWORD
  ) {
    throw new Error("You must set the environment variables");
  }

  try {
    // console.log("Loading auth page");
    await page.goto("https://shopgoodwill.com/signin", {
      waitUntil: "networkidle0",
    });

    const signoutButton = await page.$("[aria-label='Sign out']");

    if (signoutButton) {
      // console.log("Already auth");
      // Already signed in
      await page.close();
      return;
    } else {
      // console.log("Not signed in yet");
    }

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url() ===
          "https://buyerapi.shopgoodwill.com/api/SignIn/Login" &&
        response.request().method() != "OPTIONS"
    );

    // The submit button is disabled at first and the form can't be filled out until enabled
    const submit = await page.waitForSelector(
      ".form-container > button:not([disabled])"
    );

    const userNameField = await page.waitForSelector("#txtUserName");
    if (!userNameField) throw new Error("No Username Field");
    const passwordField = await page.waitForSelector("#txtPassword");
    if (!passwordField) throw new Error("No Password Field");

    await userNameField.type(process.env.SHOPGOODWILL_USERNAME);
    await passwordField.type(process.env.SHOPGOODWILL_PASSWORD);

    if (!submit) throw new Error("No Submit Button");

    await submit.click();

    // console.log("Submit Auth");

    const response = await responsePromise;
    const result = await response.json();

    await page.close();

    if (result.status !== true) {
      throw new Error("Authentication failure");
    }
  } catch (error) {
    console.error(error);
    await page?.close();
  }
};
