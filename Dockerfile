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

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/config ./config
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/projects ./projects
COPY --from=builder /app/.version ./.version

# ✅ Stable fix: include full node_modules so Prisma CLI works (c12/empathic/etc.)
COPY --from=builder /app/node_modules ./node_modules

# Create data directory for SQLite and ensure projects is writable
RUN mkdir -p /app/data /app/public/icons/generated /app/projects \
  && chown -R nextjs:nodejs /app/data /app/public/icons /app/node_modules /app/.next /app/projects

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations then start
CMD ["sh", "-c", "node server.js"]