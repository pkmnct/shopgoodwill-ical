import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCalendar } from "./feed.js";

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
