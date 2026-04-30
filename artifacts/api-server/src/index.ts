import 'dotenv/config';
import { createServer, runStartupTasks } from "./app.js";

process.on("unhandledRejection", (reason, promise) => {
  console.error("[UnhandledRejection] at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UncaughtException] Error:", err);
});

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}
const port = parseInt(rawPort, 10);

const server = createServer();

// Open the port FIRST so the platform's port detector sees a live listener
// quickly. Migrations + RBAC seeding run immediately after; if they fail,
// we exit non-zero so the platform restarts us.
const httpServer = server.listen(port, "0.0.0.0", () => {
  const addr = httpServer.address();
  console.log(`Server listening on port ${port} (addr=${JSON.stringify(addr)})`);

  runStartupTasks()
    .then(() => {
      console.log("[startup] migrations + RBAC ready — serving requests");
    })
    .catch(err => {
      console.error("[startup] fatal — refusing to continue:", err);
      process.exit(1);
    });
});
