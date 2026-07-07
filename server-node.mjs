/**
 * Node.js HTTP server adapter for the JD Connect app.
 *
 * The @lovable.dev/vite-tanstack-config build outputs:
 *  - dist/client/   → browser assets (JS, CSS, fonts, images)
 *  - dist/server/   → Cloudflare Workers-style SSR handler
 *
 * In Docker the dist/ contents land at /app/, so:
 *  - /app/client/assets/*.js|css  ← served statically here
 *  - /app/server/server.js        ← SSR fetch handler (imported below)
 *
 * We intercept any request whose path matches a file in /app/client/
 * and serve it directly with the correct MIME type + cache headers.
 * Everything else falls through to the SSR fetch handler.
 */

import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./server/server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = parseInt(process.env.PORT ?? "19003", 10);
const HOST = "0.0.0.0";

// Client assets live at /app/client/ inside the container
const CLIENT_DIR = resolve(__dirname, "client");

const MIME = new Map([
  [".js",    "application/javascript; charset=utf-8"],
  [".mjs",   "application/javascript; charset=utf-8"],
  [".css",   "text/css; charset=utf-8"],
  [".html",  "text/html; charset=utf-8"],
  [".json",  "application/json; charset=utf-8"],
  [".svg",   "image/svg+xml"],
  [".png",   "image/png"],
  [".jpg",   "image/jpeg"],
  [".jpeg",  "image/jpeg"],
  [".gif",   "image/gif"],
  [".ico",   "image/x-icon"],
  [".webp",  "image/webp"],
  [".woff",  "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf",   "font/ttf"],
  [".otf",   "font/otf"],
  [".map",   "application/json"],
]);

/**
 * Try to serve a static file from the client directory.
 * Returns true if served, false if the file doesn't exist.
 */
function tryServeStatic(urlPath, res) {
  const safePath = decodeURIComponent((urlPath.split("?")[0]) ?? "/");
  const filePath = resolve(join(CLIENT_DIR, safePath));

  // Prevent directory traversal attacks
  if (!filePath.startsWith(CLIENT_DIR)) return false;
  if (!existsSync(filePath)) return false;

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME.get(ext) ?? "application/octet-stream";

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);

  // Hashed filenames in /assets/ are safe to cache forever
  if (safePath.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-cache");
  }

  createReadStream(filePath).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  try {
    // ── Static asset serving ─────────────────────────────────────────────────
    // Intercept GET/HEAD requests and try to find the file in /app/client/
    // BEFORE passing to the SSR handler (which returns text/html for everything).
    if ((req.method === "GET" || req.method === "HEAD") && req.url !== "/") {
      if (tryServeStatic(req.url ?? "/", res)) return;
    }

    // ── SSR handler ──────────────────────────────────────────────────────────
    const host = req.headers.host ?? `localhost:${PORT}`;
    const url = `http://${host}${req.url}`;

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const rawBody = chunks.length > 0 ? Buffer.concat(chunks) : null;
    const methodHasBody = !["GET", "HEAD"].includes(req.method ?? "GET");
    const body = methodHasBody && rawBody?.length ? rawBody : undefined;

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers[key] = Array.isArray(value) ? value.join(", ") : value;
      }
    }

    const request = new Request(url, { method: req.method ?? "GET", headers, body });

    const response = await handler.fetch(request, process.env, {
      waitUntil: (_p) => {},
      passThroughOnException: () => {},
    });

    res.statusCode = response.status;
    res.statusMessage = response.statusText ?? "";
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    if (response.body) {
      for await (const chunk of response.body) {
        const ok = res.write(chunk);
        if (!ok) await new Promise((r) => res.once("drain", r));
      }
    }
    res.end();
  } catch (error) {
    console.error("[server] Unhandled request error:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`✓ JD Connect server running on http://${HOST}:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM — shutting down gracefully");
  server.close(() => { process.exit(0); });
});
