#!/usr/bin/env bash
# Start the image the way the deployment runs it (read-only, no capabilities,
# no network, only /tmp writable) and check startup and routing. It has no
# ShopGoodwill credentials and no way out, so the feed itself must fail cleanly
# with a 502 rather than crash the server.
#
# Usage: scripts/smoke-test.sh [image]
set -euo pipefail

image="${1:-shopgoodwill-ical}"
secret="smoke-test-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
network="sgw-smoke-$$"
name="sgw-smoke-$$"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create --internal "$network" >/dev/null
docker run -d --name "$name" --network "$network" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 256m --pids-limit 100 \
  -e ICAL_UNIQUE_URL="$secret" -e ICAL_URL=0.0.0.0 -e ICAL_PORT=3000 \
  -e SHOPGOODWILL_USERNAME=smoke -e SHOPGOODWILL_PASSWORD=smoke \
  "$image" >/dev/null

# The image has no shell or curl, so probe it with node from inside the container
probe() {
  docker exec "$name" /nodejs/bin/node -e '
    const [method, path] = process.argv.slice(1);
    const req = require("node:http").request(
      { host: "127.0.0.1", port: 3000, method, path, timeout: 20000 },
      (res) => { res.resume(); console.log(res.statusCode); }
    );
    req.on("error", () => console.log("closed"));
    req.end();
  ' "$1" "$2"
}

expect() {
  local label="$1" want="$2" got="$3"
  if [ "$got" = "$want" ]; then
    echo "ok   $label ($got)"
  else
    echo "FAIL $label: wanted $want, got $got"
    docker logs "$name" || true
    exit 1
  fi
}

for _ in $(seq 1 20); do
  docker logs "$name" 2>&1 | grep -q "listening" && break
  sleep 0.5
done

expect "runs as non-root" "65532" "$(docker exec "$name" /nodejs/bin/node -p 'process.getuid()')"
expect "wrong path is dropped" "closed" "$(probe GET /)"
expect "near-miss path is dropped" "closed" "$(probe GET "/${secret}x")"
expect "POST to the feed is dropped" "closed" "$(probe POST "/$secret")"
expect "feed path is routed, upstream unreachable" "502" "$(probe GET "/$secret")"
expect "still running after a failed feed" "true" "$(docker inspect -f '{{.State.Running}}' "$name")"

if docker logs "$name" 2>&1 | grep -q "$secret"; then
  echo "FAIL the secret path appears in the logs"
  exit 1
fi
echo "ok   secret path is not logged"
