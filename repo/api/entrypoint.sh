#!/bin/sh
set -e

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "CHANGE_ME_GENERATE_WITH_CRYPTO" ]; then
  export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  echo "Generated JWT_SECRET automatically"
fi

if [ -z "$ENCRYPTION_KEY" ] || [ ${#ENCRYPTION_KEY} -ne 64 ]; then
  export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "Generated ENCRYPTION_KEY automatically"
fi

export MONGO_URI="${MONGO_URI:-mongodb://cineride-db:27017/cineride}"
export API_PORT="${API_PORT:-3000}"
export NODE_ENV="${NODE_ENV:-production}"
export FACILITY_TIMEZONE="${FACILITY_TIMEZONE:-America/New_York}"
export UPLOAD_DIR="${UPLOAD_DIR:-/app/uploads}"
export MAX_FILE_SIZE_MB="${MAX_FILE_SIZE_MB:-10}"
export JWT_EXPIRATION="${JWT_EXPIRATION:-24h}"

exec node src/app.js
