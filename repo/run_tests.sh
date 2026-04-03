#!/bin/bash
set -e

echo "============================================"
echo "  CineRide — Test Suite Runner"
echo "============================================"
echo ""

# Environment
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/cineride_test}"
export MONGO_URI
export NODE_ENV=test
export JWT_SECRET=test-secret-key-not-for-production
export ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
export API_PORT=3001

echo "[1/4] Installing dependencies..."
npm ci --silent 2>/dev/null || npm install --silent

echo ""
echo "[2/4] Checking MongoDB connectivity at $MONGO_URI ..."
if ! node -e "
  const m = require('mongoose');
  m.connect('$MONGO_URI', { serverSelectionTimeoutMS: 5000 })
    .then(() => { console.log('  ✓ MongoDB connected'); return m.disconnect(); })
    .catch(e => { process.exit(1); });
" 2>/dev/null; then
  echo ""
  echo "  ✗ MongoDB is not reachable at $MONGO_URI"
  echo ""
  echo "  To start MongoDB via Docker (recommended):"
  echo "    docker compose up -d cineride-db"
  echo ""
  echo "  Or specify a custom URI:"
  echo "    MONGO_URI=mongodb://host:port/db ./run_tests.sh"
  echo ""
  echo "  Unit tests do not need MongoDB. To run only those:"
  echo "    npm run test:unit"
  echo ""
  exit 1
fi

echo ""
echo "[3/4] Running unit tests..."
echo "--------------------------------------------"
npx jest unit_tests/ --verbose --forceExit --detectOpenHandles

echo ""
echo "[4/4] Running API integration tests..."
echo "--------------------------------------------"
npx jest API_tests/ --verbose --forceExit --detectOpenHandles --runInBand

echo ""
echo "============================================"
echo "  All tests passed"
echo "============================================"
