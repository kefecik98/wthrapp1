# Multi-stage build for the WeatherAlert server.
# Primary deploy is native PM2 (see deploy/DEPLOY.md); this image exists as
# an optional containerized path.

# --- Build stage ----------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install all deps (incl. dev) so we can run prisma generate + tsc.
COPY package.json package-lock.json ./
RUN npm ci

# Prisma schema is needed before `prisma generate` runs (postinstall calls it
# only if the schema is present; we run it explicitly to be deterministic).
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage --------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Bring the generated Prisma client over from the builder. `@prisma/client`
# is already installed by npm; the generated artifacts live in `.prisma/`.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Schema + migrations are useful at runtime for `prisma migrate deploy`.
COPY prisma ./prisma
COPY --from=builder /app/dist ./dist

# Drop root.
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
