# Shopgoodwill Favorites iCal Feed

Serve an iCal feed of your Shopgoodwill favorites to be consumed in your calendar of choice.

## Configuration

Set through environment variables (a `.env` file is read by `npm run dev` only):

| Variable | Default | Purpose |
| --- | --- | --- |
| `ICAL_UNIQUE_URL` | required | Secret path the feed is served at (`/<ICAL_UNIQUE_URL>`). It is the only thing protecting the feed, so use a long random value, for example `openssl rand -hex 32`. |
| `SHOPGOODWILL_USERNAME` | required | Your pre-encrypted Shopgoodwill username (see [shopgoodwill-ts-api](https://github.com/pkmnct/shopgoodwill-ts-api)). |
| `SHOPGOODWILL_PASSWORD` | required | Your pre-encrypted Shopgoodwill password. Treat it like the password itself. |
| `ICAL_URL` | `127.0.0.1` | Address to listen on. Use `0.0.0.0` in a container. |
| `ICAL_PORT` | `3000` | Port to listen on. |
| `ICAL_CACHE_SECONDS` | `300` | How long a built feed is reused before Shopgoodwill is asked again. `0` turns the cache off; anything that is not a number uses the default. |

A failed feed build answers `502` and is not retried straight away: the server waits 15 minutes after a refused login and 60 seconds after anything else (an outage, or a session ShopGoodwill rejects after signing in), so a wrong password cannot turn every calendar poll into a login attempt. Restart the server after fixing the credentials.

The server speaks plain HTTP. Put it behind a reverse proxy that terminates TLS; the secret path must not travel unencrypted.

Its only outbound connection is HTTPS to `buyerapi.shopgoodwill.com`.

## Docker

```sh
docker run -d --name shopgoodwill-ical \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  --env-file .env -e ICAL_URL=0.0.0.0 -p 127.0.0.1:3000:3000 \
  pkmnct/shopgoodwill-ical:latest
```

Write the values in `.env` without quotes. Docker's `--env-file` passes quotes through as part of the value (Node's, used by `npm run dev`, strips them), so a quoted password is refused and a quoted `ICAL_UNIQUE_URL` changes the feed's address.

The image is distroless (no shell or package manager), runs as a non-root user (uid 65532) and needs no writable filesystem. It is built for amd64 and arm64, and rebuilt every week so base-image security patches arrive without a code change.

## Development

Requires Node 26 or newer, the version the image runs and CI tests.

```sh
npm ci
npm run dev        # compile, then run, reading .env
npm run lint
npm run typecheck
npm run docker:build && scripts/smoke-test.sh
```

## Automation

- **CI** (`.github/workflows/ci.yml`): lint, type-check, build, `npm audit` of production dependencies, and an image build with a smoke test on every pull request and push to `main`.
- **Publish** (`.github/workflows/publish.yml`): builds, smoke-tests and pushes `pkmnct/shopgoodwill-ical:latest` plus a dated tag on every push to `main`, every Wednesday, and on demand. Needs the repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.
- **Dependabot** (`.github/dependabot.yml`): weekly grouped updates for npm and GitHub Actions. Patch and minor npm updates merge themselves once CI passes; this relies on branch protection requiring the CI checks. Those merges do not start a publish run by themselves (GitHub does not trigger workflows from its own token), so they ship with the next weekly rebuild. The base images use floating tags (`node:26-trixie-slim`, distroless `nodejs26`), which Dependabot cannot bump: their patches arrive through the weekly rebuild, and moving to a new Node major is done by hand.
