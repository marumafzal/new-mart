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

const rawPort = process.env.PORT;
const port = parseInt(rawPort ?? "4000", 10);

/** Returns true if a TCP listener is already bound to the port. */
function isPortInUse(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => {
      resolve(err.code === "EADDRINUSE");
    });
    probe.once("listening", () => {
      probe.close(() => resolve(false));
    });
    probe.listen(p, "0.0.0.0");
  });
}

/** Try to free the port by killing whatever process is using it. */
function tryKillPort(p: number): boolean {
  try {
    const result = execSync(`lsof -ti tcp:${p}`, { encoding: "utf-8" }).trim();
    if (result) {
      const pids = result.split("\n").filter(Boolean);
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`);
          console.log(`[port] Killed PID ${pid} that was using port ${p}`);
        } catch {
          // ignore individual kill failures
        }
      }
      return true;
    }
  } catch {
    // lsof not available or no process found
  }
  return false;
}

/** Find the next available port starting from `start`. */
async function findAvailablePort(start: number, maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = start + i;
    const inUse = await isPortInUse(candidate);
    if (!inUse) return candidate;
  }
  throw new Error(`No available port found in range ${start}–${start + maxAttempts - 1}`);
}

async function main() {
  let listenPort = port;

  const occupied = await isPortInUse(port);
  if (occupied) {
    console.warn(`[port] Port ${port} is already in use — attempting to free it…`);
    const killed = tryKillPort(port);
    if (killed) {
      // Give the OS a moment to release the port
      await new Promise((r) => setTimeout(r, 500));
      const stillOccupied = await isPortInUse(port);
      if (stillOccupied) {
        listenPort = await findAvailablePort(port + 1);
        console.warn(`[port] Port ${port} still occupied — falling back to port ${listenPort}`);
      } else {
        console.log(`[port] Port ${port} freed successfully`);
      }
    } else {
      listenPort = await findAvailablePort(port + 1);
      console.warn(`[port] Could not free port ${port} — falling back to port ${listenPort}`);
    }
  }

  const server = createServer();

  // Open the port FIRST so the platform's port detector sees a live listener
  // quickly. Migrations + RBAC seeding run immediately after; if they fail,
  // we exit non-zero so the platform restarts us.
  const httpServer = server.listen(listenPort, "0.0.0.0", () => {
    const addr = httpServer.address();
    console.log(`Server listening on port ${listenPort} (addr=${JSON.stringify(addr)})`);

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
    console.error(`[server] Failed to bind port ${listenPort}:`, err.message);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[startup] Unrecoverable error:", err);
  process.exit(1);
});
