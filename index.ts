import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { buildCalendar, cacheSecondsFrom } from "./feed.js";
import Shopgoodwill from "shopgoodwill-ts-api";

const secretPath = process.env.ICAL_UNIQUE_URL;
if (!secretPath) {
  throw new Error("You must set ICAL_UNIQUE_URL");
}
if (secretPath.length < 16) {
  console.warn(
    "ICAL_UNIQUE_URL is shorter than 16 characters. It is the only thing protecting the feed, so use a long random value."
  );
}

const port = process.env.ICAL_PORT ? parseInt(process.env.ICAL_PORT, 10) : 3000;
const host = process.env.ICAL_URL || "127.0.0.1";
const cacheSeconds = cacheSecondsFrom(process.env.ICAL_CACHE_SECONDS);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// shopgoodwill-ts-api starts a login from its constructor without awaiting it,
// so a failed login (bad credentials, ShopGoodwill unreachable) surfaces as an
// unhandled rejection. Log it instead of letting it kill the process: every
// feed request authenticates again and reports its own failure.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", errorMessage(reason));
});

const api = new Shopgoodwill({
  encryptedUsername: process.env.SHOPGOODWILL_USERNAME,
  encryptedPassword: process.env.SHOPGOODWILL_PASSWORD,
});

// Compare fixed-length digests so the comparison takes the same time whether
// or not (and wherever) the requested path differs from the secret one.
const sha256 = (value: string) => createHash("sha256").update(value).digest();
const expectedPath = sha256("/" + secretPath);
const isFeedPath = (path: string | undefined) =>
  path !== undefined && timingSafeEqual(sha256(path), expectedPath);

const buildFeed = async (): Promise<string> => {
  await api.authenticate();
  const favorites = await api.get_favorites("all");
  if (!Array.isArray(favorites)) {
    throw new Error("ShopGoodwill did not return a list of favorites");
  }

  return buildCalendar(favorites);
};

// Each feed build is a login check plus a favorites request to ShopGoodwill.
// Share one build between concurrent requests and reuse it for a few minutes,
// so calendar clients polling the feed cannot hammer the account.
let cached: { body: string; expires: number } | undefined;
let pending: Promise<string> | undefined;

const getFeed = async (): Promise<string> => {
  if (cached && cached.expires > Date.now()) {
    return cached.body;
  }
  pending ??= buildFeed().finally(() => {
    pending = undefined;
  });
  const body = await pending;
  cached = { body, expires: Date.now() + cacheSeconds * 1000 };
  return body;
};

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
    .catch((error: unknown) => {
      console.error("Could not build the feed:", errorMessage(error));
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
