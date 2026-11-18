#!/bin/sh
set -eu

image="${1:?image is required}"
container=$(docker run --detach --platform linux/amd64 --network none "$image")
trap 'docker rm -fv "$container" >/dev/null' EXIT

attempt=1
while [ "$attempt" -le 30 ]; do
  if docker exec "$container" bun -e '
    const response = await fetch("http://127.0.0.1:3000/readyz", {
      signal: AbortSignal.timeout(3000),
    });
    const payload = await response.json();
    process.exit(response.status === 200 && payload.status === "ready" ? 0 : 1);
  ' >/dev/null 2>&1; then
    printf '%s\n' 'Image smoke passed: GET /readyz returned HTTP 200 with status ready.'
    exit 0
  fi
  if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]; then
    break
  fi
  sleep 1
  attempt=$((attempt + 1))
done

docker logs "$container" >&2
printf '%s\n' 'Image smoke failed: GET /readyz did not return HTTP 200 with status ready.' >&2
exit 1
