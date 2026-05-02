import 'dotenv/config';
import net from 'net';
import { execSync } from 'child_process';
import { createServer, runStartupTasks } from "./app.js";

process.on("unhandledRejection", (reason, promise) => {
  console.error("[UnhandledRejection] at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UncaughtException] Error:", err);
});

// Configuration from environment variables
const PORT = parseInt(process.env.PORT ?? "4000", 10);
const PORT_FALLBACK_ENABLE = (process.env.PORT_FALLBACK_ENABLE ?? "true").toLowerCase() === "true";
const PORT_MAX_RETRIES = parseInt(process.env.PORT_MAX_RETRIES ?? "10", 10);

/**
 * Returns true if a TCP listener is already bound to the port.
 * @param p - Port number to check
 */
function isPortInUse(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.debug(`[port:check] Port ${p} is in use (EADDRINUSE)`);
        resolve(true);
      } else {
        console.warn(`[port:check] Unexpected error checking port ${p}:`, err.code, err.message);
        resolve(false);
      }
    });
    probe.once("listening", () => {
      probe.close(() => {
        console.debug(`[port:check] Port ${p} is available`);
        resolve(false);
      });
    });
    probe.listen(p, "0.0.0.0");
  });
}

/**
 * Try to free the port by killing whatever process is using it.
 * @param p - Port number to free
 * @returns true if a process was killed, false otherwise
 */
function tryKillPort(p: number): boolean {
  try {
    // fuser is available via psmisc (declared in nix packages in .replit)
    execSync(`fuser -k ${p}/tcp`, { stdio: "ignore" });
    console.log(`[port:kill] Freed port ${p} using fuser`);
    return true;
  } catch {
    console.debug(`[port:kill] fuser: no process on port ${p}`);
    return false;
  }
}

/**
 * Find the next available port starting from `start`.
 * @param start - Starting port number
 * @param maxAttempts - Maximum number of ports to try
 * @returns Available port number
 * @throws Error if no available port is found
 */
async function findAvailablePort(start: number, maxAttempts: number): Promise<number> {
  console.log(`[port:search] Searching for available port starting from ${start} (max ${maxAttempts} attempts)`);
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = start + i;
    const inUse = await isPortInUse(candidate);
    if (!inUse) {
      console.log(`[port:search] Found available port: ${candidate}`);
      return candidate;
    }
  }
  const error = `No available port found in range ${start}–${start + maxAttempts - 1}`;
  console.error(`[port:search] ${error}`);
  throw new Error(error);
}

/**
 * Main server startup function with production-grade port handling.
 */
async function main() {
  let listenPort = PORT;

  console.log(`[port:init] Primary port: ${PORT}, fallback enabled: ${PORT_FALLBACK_ENABLE}, max retries: ${PORT_MAX_RETRIES}`);

  // Check if primary port is available
  const occupied = await isPortInUse(PORT);
  if (occupied) {
    console.warn(`[port:conflict] Port ${PORT} is already in use`);

    if (!PORT_FALLBACK_ENABLE) {
      console.error(`[port:conflict] Port fallback is disabled — refusing to continue`);
      process.exit(1);
    }

    // Try to free the port
    console.log(`[port:conflict] Attempting to free port ${PORT}…`);
    const killed = tryKillPort(PORT);
    if (killed) {
      // Give the OS a moment to release the port
      await new Promise((r) => setTimeout(r, 500));
      const stillOccupied = await isPortInUse(PORT);
      if (stillOccupied) {
        console.warn(`[port:conflict] Port ${PORT} still occupied after killing process — falling back`);
        listenPort = await findAvailablePort(PORT + 1, PORT_MAX_RETRIES);
        console.log(`[port:fallback] Using fallback port ${listenPort} instead of primary port ${PORT}`);
      } else {
        console.log(`[port:conflict] Port ${PORT} successfully freed — using primary port`);
        listenPort = PORT;
      }
    } else {
      console.log(`[port:conflict] Could not free port ${PORT} (no process to kill) — falling back`);
      listenPort = await findAvailablePort(PORT + 1, PORT_MAX_RETRIES);
      console.log(`[port:fallback] Using fallback port ${listenPort} instead of primary port ${PORT}`);
    }
  } else {
    console.log(`[port:check] Primary port ${PORT} is available`);
  }

  const server = createServer();

  // Open the port FIRST so the platform's port detector sees a live listener
  // quickly. Migrations + RBAC seeding run immediately after; if they fail,
  // we exit non-zero so the platform restarts us.
  const httpServer = server.listen(listenPort, "0.0.0.0", () => {
    const addr = httpServer.address();
    console.log(`[server:listen] Server listening on port ${listenPort} (addr=${JSON.stringify(addr)})`);

    runStartupTasks()
      .then(() => {
        console.log("[startup] migrations + RBAC ready — serving requests");
      })
      .catch((err: Error) => {
        console.error("[startup] fatal — refusing to continue:", err);
        process.exit(1);
      });
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`[server:error] Failed to bind port ${listenPort}:`, {
      code: err.code,
      message: err.message,
      errno: err.errno
    });
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[startup] Unrecoverable error:", err);
  process.exit(1);
});
