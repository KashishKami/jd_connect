# Local Docker Testing Guide
### Running JD Connect as a Production Container on Your Windows Dev Machine

This guide explains how to build and run the JD Connect Docker container **locally on your Windows PC** for testing purposes — before deploying to the VPS. This is Phase 1 of the migration workflow.

---

## Why Test with Docker Locally?

Running `bun run dev` and running `docker run` are fundamentally different things:

| | `bun run dev` (Dev Server) | `docker run` (Local Container) |
|---|---|---|
| **Purpose** | Day-to-day development | Testing the production build |
| **Hot reload** | ✅ Yes | ❌ No |
| **Build step** | ❌ Skipped | ✅ Full `bun run build` inside Docker |
| **Environment** | Your Windows machine | Isolated Linux container (identical to VPS) |
| **Supabase URL** | `localhost:19000` (direct) | `host.docker.internal:19000` (container → host bridge) |
| **Use case** | Writing code | Verifying production build works before pushing |

> **When to use local Docker testing:** After making infrastructure changes (Dockerfile edits, `server-node.mjs` changes, build config changes) — things that wouldn't be caught by the dev server. You don't need to do this for every code change.

---

## Prerequisites

- **Docker Desktop** installed and running on Windows
- Your **local Supabase stack** running (`docker-infra/docker-compose.yml` started locally, or via Supabase CLI)
- Values from your **`docker-infra/.env`** file:
  - `ANON_KEY` → used as `VITE_SUPABASE_PUBLISHABLE_KEY` (build-time)
  - `SERVICE_ROLE_KEY` → used as `SUPABASE_SERVICE_ROLE_KEY` (runtime)

---

## Understanding: Build-time vs Runtime Variables

This is the most important concept for Docker. There are **two completely separate stages**:

### 1. Build-time (`--build-arg`) — Baked into the JavaScript bundle

These are values that Vite **bakes permanently into the client-side JavaScript bundle** during `bun run build`. Once the image is built, these values are frozen inside the compiled JS files.

| Variable | Where it comes from | Why |
|---|---|---|
| `VITE_SUPABASE_URL` | `--build-arg` during `docker build` | The browser (client-side) uses this to connect to Supabase. Baked into the JS bundle at build time. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `--build-arg` during `docker build` | The browser's public Supabase anon key. Also baked at build time. |

> **For local testing:** Use `http://localhost:19000` for `VITE_SUPABASE_URL` because **the browser** (running on your Windows machine) connects to Supabase at `localhost:19000`. The browser is NOT inside Docker.

### 2. Runtime (`-e`) — Injected when the container starts

These are values the **server-side Node.js process** reads via `process.env` when the container boots. They are NOT baked into any file — they can be changed without rebuilding the image.

| Variable | Where it comes from | Why |
|---|---|---|
| `SUPABASE_URL` | `-e` flag in `docker run` | The server-side code uses this to call Supabase APIs. Must use `host.docker.internal` because the Node.js process IS inside Docker. |
| `SUPABASE_SERVICE_ROLE_KEY` | `-e` flag in `docker run` | The secret server-side key for privileged Supabase operations. Never baked into the build. |
| `NODE_ENV` | `-e` flag | Tells Node.js it's running in production mode. |
| `PORT` | `-e` flag | The port the server listens on inside the container. |

> **`host.docker.internal` explained:** When your app code (running inside Docker on Linux) tries to connect to `localhost:19000`, it is referring to the Linux container's own localhost — which has nothing on port 19000. `host.docker.internal` is Docker Desktop's special DNS name that points to your Windows machine's actual localhost, allowing the container to reach your locally running Supabase.

---

## Step-by-Step: Build and Run Locally

### Step 1 — Build the Docker Image

Replace `YOUR_ANON_KEY` with the `ANON_KEY` value from your `docker-infra/.env`.

```powershell
docker build -t jd-connect-local . `
  --build-arg VITE_SUPABASE_URL=http://localhost:19000 `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY
```

**Example with placeholder values:**
```powershell
docker build -t jd-connect-local . `
  --build-arg VITE_SUPABASE_URL=http://localhost:19000 `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_ANON_KEY_HERE
```

> This runs the full build inside a `node:22-alpine` container: installs dependencies, compiles the app, and produces an image ready to run.

> ⚠️ **The build takes 3–5 minutes the first time** (downloads the Node.js base image, installs all `node_modules`, compiles the full app). Subsequent builds are much faster due to Docker layer caching.

---

### Step 2 — Run the Container

Replace `YOUR_SERVICE_ROLE_KEY` and `YOUR_ANON_KEY` with the matching values from `docker-infra/.env`.

> ⚠️ **Important:** `SUPABASE_PUBLISHABLE_KEY` (no `VITE_` prefix) **must** be passed at runtime.
> The `VITE_` prefixed key is baked into the client bundle at build time, but the server-side
> middleware reads `process.env.SUPABASE_PUBLISHABLE_KEY` at runtime. Omitting it causes
> "Unauthorized" errors on every server function (password reset, delete, AI, etc.).

```powershell
docker run -d --name jdc-test -p 19003:19003 `
  -e NODE_ENV=production `
  -e PORT=19003 `
  -e SUPABASE_URL=http://host.docker.internal:19000 `
  -e SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY `
  -e SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY `
  jd-connect-local
```

**What each flag means:**

| Flag | Meaning |
|---|---|
| `-d` | Run in detached (background) mode — terminal stays free |
| `--name jdc-test` | Give the container a friendly name so you can reference it easily |
| `-p 19003:19003` | Map your Windows port 19003 → container port 19003 |
| `-e NODE_ENV=production` | Enable production mode in Node.js |
| `-e PORT=19003` | Tell the server which port to listen on inside the container |
| `-e SUPABASE_URL=...` | Server-side Supabase URL (uses `host.docker.internal` to reach your Windows Supabase) |
| `-e SUPABASE_PUBLISHABLE_KEY=...` | Anon key — required by server-side auth middleware at runtime |
| `-e SUPABASE_SERVICE_ROLE_KEY=...` | Privileged server-side Supabase key |
| `jd-connect-local` | The name of the image to run (built in Step 1) |

---

### Step 3 — Check Logs

```powershell
docker logs jdc-test
```

You should see:
```
✓ JD Connect server running on http://0.0.0.0:19003
⚠️  Node.js 20 and below are deprecated...   ← harmless warning, ignore
```

If you see any `Error` lines, the server crashed — share the full log output to debug.

---

### Step 4 — Open in Browser

Go to **`http://localhost:19003`** in your browser.

You should see the fully styled JD Connect login page. You can log in with your actual credentials since it's connected to your local Supabase.

---

### Step 5 — Stop and Clean Up

```powershell
# Stop and remove the container
docker rm -f jdc-test

# (Optional) Remove the built image to free disk space
docker rmi jd-connect-local
```

---

## One-Line Rebuild + Run (For Quick Iteration)

When you've made a change and want to rebuild and retest quickly:

```powershell
docker rm -f jdc-test; docker build -t jd-connect-local . --build-arg VITE_SUPABASE_URL=http://localhost:19000 --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY; docker run -d --name jdc-test -p 19003:19003 -e NODE_ENV=production -e PORT=19003 -e SUPABASE_URL=http://host.docker.internal:19000 -e SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY jd-connect-local; docker logs jdc-test
```

*(Put it all on one line to avoid PowerShell backtick continuation issues)*

---

## Local vs VPS: Side-by-Side Comparison

| | Local Docker Testing | VPS Production |
|---|---|---|
| **Who starts the container** | You manually run `docker run` | GitHub Actions runs `docker compose up -d` automatically |
| **Where the image comes from** | Built locally on your PC (`docker build`) | Pulled from GitHub Container Registry (GHCR) |
| **Env vars source** | `-e` flags typed manually in the terminal | Written to `.env` file from GitHub Secrets by the pipeline |
| **Config file used** | None (raw `docker run` flags) | `docker-compose.prod.yml` |
| **Supabase URL for browser** (build-time) | `http://localhost:19000` | `https://supabase.yourdomain.com` (after Phase 3) |
| **Supabase URL for server** (runtime) | `http://host.docker.internal:19000` | `http://supabase-kong:8000` or `http://localhost:19000` depending on network |
| **SSL/HTTPS** | ❌ No (plain `http://localhost`) | ✅ Yes (via Traefik + Let's Encrypt) |
| **Traefik routing** | ❌ Not involved | ✅ Traefik routes `jdconnect.yourdomain.com` → container |
| **Restart on crash** | ❌ No (one-shot run) | ✅ Yes (`restart: unless-stopped` in compose) |
| **Purpose** | Verify production build before pushing | The actual live application |

---

## Common Issues & Fixes

### "Cannot connect to Supabase" / Auth errors
- Make sure your local Supabase stack is running: `docker ps | grep supabase`
- Make sure Kong is healthy on port 19000: `curl http://localhost:19000/health`
- Confirm you used `host.docker.internal:19000` for `SUPABASE_URL`, not `localhost:19000`

### "This page didn't load" (error page)
- Run `docker logs jdc-test` immediately — the error will be in the logs
- Most common cause: wrong `VITE_SUPABASE_URL` or empty build args (rebuild with correct values)

### CSS / JS not loading (MIME type errors in browser console)
- This means the static file server is not running correctly
- Check `server-node.mjs` is present in the image: `docker exec jdc-test ls /app/`

### Port 19003 already in use
```powershell
# Find and kill what's using the port
netstat -ano | findstr :19003
taskkill /PID <PID> /F
```

### Image is stale (running old code)
- Always rebuild the image after code changes: `docker build -t jd-connect-local .`
- Docker layer caching is aggressive — if you changed `server-node.mjs` only, the build will be fast (most layers cached)
