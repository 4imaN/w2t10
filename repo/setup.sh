#!/bin/bash
set -e

ENV_FILE=".env"

echo "============================================"
echo "  CineRide — First-Time Setup"
echo "============================================"
echo ""

if [ -f "$ENV_FILE" ]; then
  echo "Found existing $ENV_FILE."
  read -p "Overwrite with fresh secrets? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Keeping existing $ENV_FILE. Done."
    exit 0
  fi
fi

echo "Generating secure secrets..."

JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

cat > "$ENV_FILE" <<EOL
# CineRide — Auto-generated environment file
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# MongoDB
MONGO_URI=mongodb://cineride-db:27017/cineride
MONGO_DB_NAME=cineride

# JWT (auto-generated — do not share)
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRATION=24h

# Encryption key (auto-generated — do not share)
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Server
API_PORT=3000
NODE_ENV=production

# Facility
FACILITY_TIMEZONE=America/New_York

# File uploads
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE_MB=10
EOL

echo ""
echo "Created $ENV_FILE with secure random secrets."
echo ""
echo "Next steps:"
echo "  docker compose up --build -d"
echo "  open http://localhost:8080"
echo ""
echo "Bootstrap credentials are written to a file on first startup."
echo "Retrieve them with:"
echo "  docker compose exec cineride-api cat /app/uploads/.bootstrap-credentials"
echo "Then delete the file:"
echo "  docker compose exec cineride-api rm /app/uploads/.bootstrap-credentials"
echo "All accounts require password change on first login."
echo ""
echo "============================================"
