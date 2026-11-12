import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import {
  buildFeed,
  cacheSecondsFrom,
  isUrlSafeSecret,
  LoginRefusedError,
} from "./feed.js";
import { createFeedCache } from "./feedCache.js";
import Shopgoodwill, {
  ShopgoodwillAuthError,
  ShopgoodwillUnavailableError,
} from "shopgoodwill-ts-api";

const secretPath = process.env.ICAL_UNIQUE_URL;
if (!secretPath) {
  throw new Error("You must set ICAL_UNIQUE_URL");
}
if (secretPath.length < 16) {
  console.warn(
    "ICAL_UNIQUE_URL is shorter than 16 characters. It is the only thing protecting the feed, so use a long random value."
  );
}
// A warning, not an error: a client that sends the path unencoded still works
if (!isUrlSafeSecret(secretPath)) {
  console.warn(
    "ICAL_UNIQUE_URL has characters that calendar apps encode or drop in a URL (such as a space, a quote, # or non-ASCII), so their requests will not match and will be rejected. Use only letters, digits, - . _ and ~."
  );
}

const port = process.env.ICAL_PORT ? parseInt(process.env.ICAL_PORT, 10) : 3000;
const host = process.env.ICAL_URL || "127.0.0.1";
const cacheSeconds = cacheSecondsFrom(process.env.ICAL_CACHE_SECONDS);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const encryptedUsername = process.env.SHOPGOODWILL_USERNAME;
const encryptedPassword = process.env.SHOPGOODWILL_PASSWORD;
if (!encryptedUsername || !encryptedPassword) {
  const missing = [
    !encryptedUsername && "SHOPGOODWILL_USERNAME",
    !encryptedPassword && "SHOPGOODWILL_PASSWORD",
  ].filter(Boolean);
  throw new Error(`You must set ${missing.join(" and ")}`);
}

const api = new Shopgoodwill({ encryptedUsername, encryptedPassword });

// Compare fixed-length digests so the comparison takes the same time whether
// or not (and wherever) the requested path differs from the secret one.
const sha256 = (value: string) => createHash("sha256").update(value).digest();
const expectedPath = sha256("/" + secretPath);
const isFeedPath = (path: string | undefined) =>
  path !== undefined && timingSafeEqual(sha256(path), expectedPath);

// A wrong password must not become a login attempt on every poll (that risks
// a lockout), so a refused login is held for longer than anything else. A 401
// or 403 on the favorites request is not one: it gets the short hold.
const AUTH_FAILURE_SECONDS = 15 * 60;
const OTHER_FAILURE_SECONDS = 60;

const getFeed = createFeedCache(() => buildFeed(api), {
  cacheSeconds,
  failureSeconds: (error) =>
    error instanceof LoginRefusedError
      ? AUTH_FAILURE_SECONDS
      : OTHER_FAILURE_SECONDS,
  onFailure: (error) => {
    if (error instanceof LoginRefusedError) {
      console.error(
        `ShopGoodwill refused the login. Check SHOPGOODWILL_USERNAME and SHOPGOODWILL_PASSWORD; not trying again for ${AUTH_FAILURE_SECONDS / 60} minutes:`,
        errorMessage(error.cause)
      );
    } else if (error instanceof ShopgoodwillAuthError) {
      console.error(
        `ShopGoodwill rejected the session after signing in; signing in again in ${OTHER_FAILURE_SECONDS} seconds:`,
        errorMessage(error)
      );
    } else if (error instanceof ShopgoodwillUnavailableError) {
      console.error(
        `ShopGoodwill is unreachable or failing; not trying again for ${OTHER_FAILURE_SECONDS} seconds:`,
        errorMessage(error)
      );
    } else {
      console.error(
        `Could not build the feed; not trying again for ${OTHER_FAILURE_SECONDS} seconds:`,
        errorMessage(error)
      );
    }
  },
});

const server = http.createServer((req, res) => {
  if (!isFeedPath(req.url) || (req.method !== "GET" && req.method !== "HEAD")) {
    // Deliberately not logging the URL or headers: a near-miss URL would put
    // most of the secret in the logs, and the rest is attacker-controlled.
    console.log("Rejected incoming request");
    res.destroy();
    return;
  }

  console.log("Valid incoming request, getting favorites...");
  getFeed()
    .then((body) => {
      res.writeHead(200, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="calendar.ics"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    })
    .catch(() => {
      // Always 502, whatever the cause: calendar apps then keep the events
      // they have, where a 401 could make them prompt or drop the feed. The
      // failure itself is logged once, when the build fails.
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Could not load favorites from ShopGoodwill\n");
    });
});

server.listen(port, host, () => {
  // The secret path is left out on purpose so it does not end up in the logs
  console.log(`iCal feed listening on http://${host}:${port}/<ICAL_UNIQUE_URL>`);
});

// Run as PID 1 in the container: exit promptly when Docker stops it
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
