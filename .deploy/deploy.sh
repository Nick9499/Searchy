#!/bin/bash
set -e

echo "========================================="
echo "   Deploying Searchy Production Update   "
echo "========================================="

# 0. Pre-flight check: verify .env exists
echo "==> [Check] Verifying .env configuration file..."
if [ ! -f .env ]; then
  echo "    ❌ ERROR: .env file not found in current directory!"
  echo "    Please create .env using .deploy/env.prod.example as a template."
  exit 1
fi
echo "    ✓ .env file found."

# 1. Pull latest repository files
echo "==> [Step 1/7] Pulling latest repository files from GitHub..."
git pull
echo "    ✓ Repository files updated."

# 2. Pull pre-built production Docker image from GitHub Container Registry
echo "==> [Step 2/7] Pulling pre-built Docker image from GitHub Container Registry..."
docker compose --env-file .env -f .deploy/docker-compose.prod.yml pull app
echo "    ✓ Image pulled successfully."

# 3. Start or update containers
echo "==> [Step 3/7] Starting/updating production containers..."
docker compose --env-file .env -f .deploy/docker-compose.prod.yml up -d
echo "    ✓ Containers launched in background."

# 4. Wait for PostgreSQL to be ready
echo "==> [Step 4/7] Waiting for PostgreSQL database to accept connections..."
DB_USER=$(grep -E '^DB_USER=' .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" || echo "postgres")
DB_USER=${DB_USER:-postgres}

for i in {1..30}; do
  if docker compose --env-file .env -f .deploy/docker-compose.prod.yml exec -T db pg_isready -U "$DB_USER" >/dev/null 2>&1; then
    echo "    ✓ PostgreSQL is healthy and accepting connections."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "    ❌ ERROR: Database timed out after 30 seconds."
    exit 1
  fi
  echo "    Waiting for database to boot... ($i/30)"
  sleep 1
done

# 5. Run Drizzle DB migrations
echo "==> [Step 5/7] Running database schema migrations..."
docker compose --env-file .env -f .deploy/docker-compose.prod.yml exec -T app node dist/db/migrate.js
echo "    ✓ Database migrations applied successfully."

# 6. Clean up old unused Docker images
echo "==> [Step 6/7] Pruning unused Docker images to free disk space..."
docker image prune -f
echo "    ✓ Unused images pruned."

# 7. Print running container status
echo "==> [Step 7/7] Verifying container status..."
docker compose --env-file .env -f .deploy/docker-compose.prod.yml ps

echo "========================================="
echo "   Deployment completed successfully!    "
echo "========================================="
