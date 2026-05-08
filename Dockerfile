# ── Stage 1: Install dependencies ─────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++ linux-headers
WORKDIR /app
COPY package.json package-lock.json* ./
# Force install all deps including devDependencies (needed for build)
ENV NODE_ENV=development
RUN npm ci --ignore-scripts
ENV NODE_ENV=production
# argon2 needs native build
RUN npm rebuild argon2

# ── Stage 2: Build ────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ linux-headers git
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Store git version for runtime
RUN git rev-parse --short HEAD > .version 2>/dev/null || echo "unknown" > .version
# Generate Prisma client
RUN npx prisma generate
# Build Next.js
RUN npm run build

# ── Stage 3: Production ──────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache python3 make g++ linux-headers sqlite
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build (set ownership at copy time — avoids slow chown -R)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/config ./config
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/projects ./projects
COPY --from=builder --chown=nextjs:nodejs /app/.version ./.version

# ✅ Stable fix: include full node_modules so Prisma CLI works (c12/empathic/etc.)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Worker source (run via tsx). The Next.js standalone bundle doesn't include
# `src/` or `worker/`, but the worker container needs both. They're tiny
# compared to node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/worker ./worker
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# git is required by the worker for clone/commit/push
RUN apk add --no-cache git

# Create runtime-only directories (small — fast chown)
RUN mkdir -p /app/data /app/public/icons/generated \
  && chown -R nextjs:nodejs /app/data /app/public/icons

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations then start
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node server.js"]