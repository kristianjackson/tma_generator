#!/usr/bin/env sh
set -eu

# Retries deploys to handle transient Cloudflare API failures (for example
# assets upload session errors like code 10013).
MAX_ATTEMPTS="${DEPLOY_MAX_ATTEMPTS:-4}"
DELAY_SECONDS="${DEPLOY_RETRY_DELAY_SECONDS:-5}"
ATTEMPT=1

while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
  echo "Deploy attempt ${ATTEMPT}/${MAX_ATTEMPTS}"
  if npx @opennextjs/cloudflare deploy; then
    echo "Deploy succeeded"
    exit 0
  fi

  EXIT_CODE=$?
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "Deploy failed after ${MAX_ATTEMPTS} attempts"
    exit "$EXIT_CODE"
  fi

  echo "Deploy attempt ${ATTEMPT} failed (exit ${EXIT_CODE}). Retrying in ${DELAY_SECONDS}s..."
  sleep "$DELAY_SECONDS"
  ATTEMPT=$((ATTEMPT + 1))
  DELAY_SECONDS=$((DELAY_SECONDS * 2))
done

