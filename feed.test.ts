import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ShopgoodwillAuthError,
  ShopgoodwillUnavailableError,
} from "shopgoodwill-ts-api";
import {
  buildCalendar,
  buildFeed,
  cacheSecondsFrom,
  LoginRefusedError,
} from "./feed.js";

// 18:07 Pacific on 2026-11-20 (item 283669554), as shopgoodwill-ts-api returns it
const endTime = new Date("2026-11-21T02:07:00.000Z");
const favorite = { itemId: 283669554, title: "Diamond studs", endTime };

describe("buildCalendar", () => {
  it("writes the end time as a UTC instant, whatever the server's timezone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "America/New_York", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        const body = buildCalendar([favorite]);
        assert.match(body, /DTSTART:20261121T020700Z/);
        assert.match(body, /DTEND:20261121T020700Z/);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("has no calendar-level timezone for clients to guess from", () => {
    const body = buildCalendar([favorite]);
    assert.doesNotMatch(body, /X-WR-TIMEZONE|TIMEZONE-ID|TZID/);
  });

  it("gives an item the same UID every time", () => {
    assert.match(buildCalendar([favorite]), /UID:shopgoodwill-283669554/);
    assert.match(buildCalendar([favorite]), /UID:shopgoodwill-283669554/);
  });

  it("refuses an offset-less string instead of guessing a timezone", () => {
    assert.throws(
      () => buildCalendar([{ ...favorite, endTime: "2026-11-20T18:07:00" }]),
      /shopgoodwill-ts-api 1\.x/
    );
  });

  it("skips an item with an invalid date and keeps the rest", () => {
    const body = buildCalendar([
      { ...favorite, itemId: 1, endTime: new Date("nope") },
      { ...favorite, itemId: 2 },
    ]);
    assert.doesNotMatch(body, /UID:shopgoodwill-1\b/);
    assert.match(body, /UID:shopgoodwill-2\b/);
  });

  it("makes an empty calendar for no favorites", () => {
    const body = buildCalendar([]);
    assert.match(body, /BEGIN:VCALENDAR/);
    assert.doesNotMatch(body, /BEGIN:VEVENT/);
  });
});

describe("cacheSecondsFrom", () => {
  it("uses the default when unset or blank", () => {
    assert.equal(cacheSecondsFrom(undefined), 300);
    assert.equal(cacheSecondsFrom("  "), 300);
  });

  it("accepts a number of seconds, including 0 to switch the cache off", () => {
    assert.equal(cacheSecondsFrom("60"), 60);
    assert.equal(cacheSecondsFrom("0"), 0);
  });

  it("falls back to the default for anything else", () => {
    for (const bad of ["five", "-1", "10s", "Infinity"]) {
      assert.equal(cacheSecondsFrom(bad), 300, bad);
    }
  });
});

describe("buildFeed", () => {
  const api = (overrides: Partial<Parameters<typeof buildFeed>[0]> = {}) => ({
    authenticate: async () => undefined,
    get_favorites: async () => [favorite],
    ...overrides,
  });
  const failing = (error: Error) => async () => {
    throw error;
  };

  it("signs in and builds the calendar", async () => {
    assert.match(await buildFeed(api()), /UID:shopgoodwill-283669554/);
  });

  it("calls an auth error from authenticate() a refused login", async () => {
    const cause = new ShopgoodwillAuthError("Login failed: Shopgoodwill returned HTTP 401", 401);
    await assert.rejects(
      buildFeed(api({ authenticate: failing(cause) })),
      (error: unknown) => error instanceof LoginRefusedError && error.cause === cause
    );
  });

  it("does not call a 401 or 403 on the favorites request a refused login", async () => {
    const error = new ShopgoodwillAuthError("Could not load favorites: Shopgoodwill returned HTTP 403", 403);
    await assert.rejects(
      buildFeed(api({ get_favorites: failing(error) })),
      (thrown: unknown) => thrown === error
    );
  });

  it("passes an outage during sign-in through unchanged", async () => {
    const error = new ShopgoodwillUnavailableError("Could not reach Shopgoodwill");
    await assert.rejects(
      buildFeed(api({ authenticate: failing(error) })),
      (thrown: unknown) => thrown === error
    );
  });
});
