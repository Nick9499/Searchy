# ---- Base ----
FROM node:24-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Development (Hot-reloading) ----
FROM base AS dev
COPY . .
CMD ["npm", "run", "dev"]

# ---- Builder ----
FROM base AS builder
COPY . .
RUN npm run build

# ---- Production (Debian glibc, lean) ----
FROM node:24-slim AS prod
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
CMD ["npm", "run", "start"]
