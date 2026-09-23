# Multi-stage build for the WeatherAlert server.
#
# This is the canonical deploy path (see deploy/DEPLOY.md): the image runs on
# the rack under Docker Compose alongside Postgres, Caddy and the frp tunnel
# client. The PM2 artifacts in deploy/ (ecosystem.config.cjs, nginx/) are kept
# as a fallback but are no longer what CI ships.

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
#
# NOTE: the `prisma` CLI is deliberately a *production* dependency (not a dev
# one) so that it survives --omit=dev. Deploys run `prisma migrate deploy` as
# a one-shot container from this same image (deploy/deploy.sh), which keeps
# the whole deploy to a single artifact to build, push, pin and roll back.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Bring the generated Prisma client over from the builder. `@prisma/client`
# is already installed by npm; the generated artifacts live in `.prisma/`.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Schema + migrations are needed at runtime for `prisma migrate deploy`.
COPY prisma ./prisma
COPY --from=builder /app/dist ./dist

# Drop root.
USER node

EXPOSE 3000

# Compose gates the app on this (and the deploy script polls /health too).
# The image has no curl, so use Node's built-in fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
