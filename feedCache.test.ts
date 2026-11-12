import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFeedCache } from "./feedCache.js";

const setup = (cacheSeconds = 300) => {
  let time = 1_000_000;
  let builds = 0;
  let fail: Error | undefined;
  const failures: unknown[] = [];
  const get = createFeedCache(
    async () => {
      builds++;
      await Promise.resolve();
      if (fail) throw fail;
      return `feed ${builds}`;
    },
    {
      cacheSeconds,
      failureSeconds: (error) => ((error as Error).message === "auth" ? 900 : 60),
      onFailure: (error) => failures.push(error),
      now: () => time,
    }
  );
  return {
    get,
    builds: () => builds,
    failures,
    advance: (seconds: number) => (time += seconds * 1000),
    failWith: (error: Error | undefined) => (fail = error),
  };
};

describe("createFeedCache", () => {
  it("shares one build between concurrent requests", async () => {
    const cache = setup();
    assert.deepEqual(await Promise.all([cache.get(), cache.get(), cache.get()]), ["feed 1", "feed 1", "feed 1"]);
    assert.equal(cache.builds(), 1);
  });

  it("reuses a feed until it expires", async () => {
    const cache = setup(300);
    await cache.get();
    cache.advance(299);
    assert.equal(await cache.get(), "feed 1");
    cache.advance(2);
    assert.equal(await cache.get(), "feed 2");
  });

  it("builds every time when the cache is off", async () => {
    const cache = setup(0);
    await cache.get();
    await cache.get();
    assert.equal(cache.builds(), 2);
  });

  it("remembers a failure instead of trying again on every request", async () => {
    const cache = setup();
    cache.failWith(new Error("down"));
    await assert.rejects(cache.get(), /down/);
    await assert.rejects(cache.get(), /down/);
    cache.advance(59);
    await assert.rejects(cache.get(), /down/);
    assert.equal(cache.builds(), 1);
    assert.equal(cache.failures.length, 1);
  });

  it("tries again once the failure has aged out, and recovers", async () => {
    const cache = setup();
    cache.failWith(new Error("down"));
    await assert.rejects(cache.get());
    cache.advance(61);
    cache.failWith(undefined);
    assert.equal(await cache.get(), "feed 2");
    assert.equal(await cache.get(), "feed 2");
  });

  it("holds off longer after a refused login", async () => {
    const cache = setup();
    cache.failWith(new Error("auth"));
    await assert.rejects(cache.get());
    cache.advance(899);
    await assert.rejects(cache.get());
    assert.equal(cache.builds(), 1);
    cache.advance(2);
    await assert.rejects(cache.get());
    assert.equal(cache.builds(), 2);
  });

  it("remembers failures even when the feed cache is off", async () => {
    const cache = setup(0);
    cache.failWith(new Error("down"));
    await assert.rejects(cache.get());
    await assert.rejects(cache.get());
    assert.equal(cache.builds(), 1);
  });

  it("shares a failing build between concurrent requests", async () => {
    const cache = setup();
    cache.failWith(new Error("down"));
    const results = await Promise.allSettled([cache.get(), cache.get()]);
    assert.deepEqual(results.map((r) => r.status), ["rejected", "rejected"]);
    assert.equal(cache.builds(), 1);
  });
});
