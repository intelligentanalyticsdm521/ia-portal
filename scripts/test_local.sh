#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== IADM Portal Step 4: Local Test =="

echo "-- 1) Node/NPM versions"
node -v
npm -v

echo "-- 2) Install dependencies (npm ci)"
npm ci

echo "-- 3) Build (TypeScript + Vite)"
npm run build

echo "-- 4) Env key presence check (.env.local OR build-time env)"
ENV_FILE=".env.local"
if [[ -f "$ENV_FILE" ]]; then
  echo "Found .env.local; checking required keys exist..."
  REQUIRED_KEYS=(
    "VITE_PLATFORM_API_BASE_URL"
    "VITE_AUTH_CLIENT_ID"
    "VITE_AUTH_AUTHORITY"
    "VITE_AUTH_KNOWN_AUTHORITIES"
    "VITE_AUTH_REDIRECT_URI"
    "VITE_AUTH_POST_LOGOUT_REDIRECT_URI"
    "VITE_AUTH_SCOPES"
    "VITE_DEFAULT_TENANT_ID"
    "VITE_DEFAULT_PORTAL_CONTEXT"
  )

  FAIL=0
  for k in "${REQUIRED_KEYS[@]}"; do
    if ! grep -q "^${k}=" "$ENV_FILE"; then
      echo "MISSING: $k"
      FAIL=1
    fi
  done

  if [[ "$FAIL" -eq 1 ]]; then
    echo "ENV CHECK: FAIL (missing required keys in .env.local)"
    exit 1
  fi
  echo "ENV CHECK: PASS"
else
  echo "No .env.local found. (OK for CI/prod if environment variables are set there.)"
fi

echo "LOCAL TEST: PASS"
