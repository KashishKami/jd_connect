# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install Bun globally
RUN npm install -g bun

WORKDIR /app

# Copy lock and package files first to leverage Docker layer caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build-time environment arguments (Vite requires these during compilation)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# Force Nitro to build for Node.js (not Cloudflare, which is the default in @lovable.dev/vite-tanstack-config)
ENV NITRO_PRESET=node

# Build the TanStack Start application (compiles SSR code via Nitro)
RUN bun run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy only the compiled output directory from the builder stage
COPY --from=builder /app/.output ./

# Set runtime environment variables
ENV NODE_ENV=production
ENV PORT=19003

EXPOSE 19003

# Run the Nitro server entrypoint
CMD ["node", "server/index.mjs"]
