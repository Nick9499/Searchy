#!/bin/bash
set -e

echo "========================================="
echo "   Deploying Searchy Production Update   "
echo "========================================="

# 1. Pull latest code
echo "==> Pulling latest changes from master..."
git pull origin master

# 2. Build and restart containers
echo "==> Building and starting production containers..."
docker compose -f .deploy/docker-compose.prod.yml up -d --build

# 3. Wait for PostgreSQL to be ready
echo "==> Waiting for database to be healthy..."
sleep 5

# 4. Run Drizzle DB migrations
echo "==> Running database migrations..."
docker compose -f .deploy/docker-compose.prod.yml exec -T app npx drizzle-kit migrate

echo "========================================="
echo "   Deployment completed successfully!    "
echo "========================================="
