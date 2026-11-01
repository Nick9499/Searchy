#!/bin/bash
set -e

echo "========================================="
echo "   Deploying Searchy Production Update   "
echo "========================================="

# 1. Pull latest code
echo "==> Pulling latest changes..."
git pull

# 2. Build and restart containers
echo "==> Building and starting production containers..."
docker compose --env-file .env -f .deploy/docker-compose.prod.yml up -d --build

# 3. Wait for PostgreSQL to be ready
echo "==> Waiting for database to be healthy..."
sleep 5

# 4. Run Drizzle DB migrations
echo "==> Running database migrations..."
docker compose --env-file .env -f .deploy/docker-compose.prod.yml exec -T app npx drizzle-kit migrate

echo "========================================="
echo "   Deployment completed successfully!    "
echo "========================================="
