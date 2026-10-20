# ---- Base ----
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Development ----
FROM base AS dev
COPY . .
CMD ["npm", "run", "dev"]

# ---- Build ----
FROM base AS builder
COPY . .
RUN npm run build

# ---- Production ----
FROM node:24-alpine AS prod
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["npm", "run", "start"]
