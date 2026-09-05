#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

latest_zip="$({
  find "$SCRIPT_DIR" -maxdepth 1 -type f -name 'jobtracker-distribution-v*.zip' -printf '%f\n' || true
} | sort -V | tail -n 1)"

if [[ -z "$latest_zip" ]]; then
  echo "No distribution zip files found matching pattern 'jobtracker-distribution-v*.zip'" >&2
  exit 1
fi

echo "Found latest distribution package: $latest_zip"
echo "Extracting package..."
unzip -o "$SCRIPT_DIR/$latest_zip" -d "$SCRIPT_DIR"

echo "Restarting container stack..."
docker compose --env-file "$SCRIPT_DIR/deploy/.env.prod" -f "$SCRIPT_DIR/docker-compose.prod.yml" down
docker compose --env-file "$SCRIPT_DIR/deploy/.env.prod" -f "$SCRIPT_DIR/docker-compose.prod.yml" up -d --build

echo "Deployment complete for $latest_zip!"
