# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

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

# Build the TanStack Start application
RUN bun run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Copy node_modules from the builder — the server bundle has external dependencies
# (React, TanStack, etc.) that are NOT bundled and must be present at runtime.
# Both stages use the same base image (node:20-alpine/linux) so the binaries are compatible.
COPY --from=builder /app/node_modules ./node_modules

# Copy the compiled app from the builder stage
COPY --from=builder /app/dist ./

# Copy the Node.js HTTP adapter that wraps the Cloudflare Workers-style handler
COPY server-node.mjs ./server-node.mjs

# Set runtime environment variables
ENV NODE_ENV=production
ENV PORT=19003

EXPOSE 19003

# Run the Node.js HTTP adapter (wraps the CF Workers handler in a real HTTP server)
CMD ["node", "server-node.mjs"]
