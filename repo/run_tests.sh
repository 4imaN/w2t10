#!/bin/bash
set -e

echo "============================================"
echo "  CineRide — Test Suite Runner (Docker)"
echo "============================================"
echo ""

# All tests run inside dedicated test containers with devDependencies installed.
# The test container connects to cineride-db via the Docker network.

# Ensure MongoDB is running
if ! docker compose ps --services --filter "status=running" 2>/dev/null | grep -q "cineride-db"; then
  echo "  Starting MongoDB..."
  docker compose up -d cineride-db
  echo "  Waiting for MongoDB to be healthy..."
  sleep 10
fi

echo "[1/2] Running backend tests (unit + API)..."
echo "--------------------------------------------"
docker compose --profile test run --rm cineride-test

echo ""
echo "[2/2] Running frontend tests..."
echo "--------------------------------------------"
docker compose --profile test run --rm cineride-frontend-test

echo ""
echo "============================================"
echo "  All tests passed"
echo "============================================"
