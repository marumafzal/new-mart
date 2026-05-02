import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/* PORT defaults to 5174 for the rider Vite dev server when not provided.
   Capacitor builds skip dev-server config entirely. */
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5174;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/* BASE_PATH defaults to "/rider/" so the in-app router base matches the
   most common deployment (path-routed behind the Replit proxy). Standalone
   deployments or local quick-starts override via env. */
const basePath = process.env.BASE_PATH || "/rider/";
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8080";

export default defineConfig(async ({ mode }) => {
  /* Build-time HMAC secret check — warn loudly if the secret is absent in
     production so it is never silently missing in a deployed build. */
  if (mode === "production" && !process.env.VITE_ERROR_REPORT_HMAC_SECRET) {
    console.warn(
      "\n[vite:rider] WARNING: VITE_ERROR_REPORT_HMAC_SECRET is not set.\n" +
      "  Error reports from the rider app will NOT be sent (HMAC signing disabled).\n" +
      "  Set this variable in your build environment before deploying.\n"
    );
  }

  return {
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-query";
          }
          if (id.includes("node_modules/socket.io-client") || id.includes("node_modules/engine.io-client") || id.includes("node_modules/@socket.io/")) {
            return "vendor-socket";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          if (id.includes("node_modules/@sentry/")) {
            return "vendor-sentry";
          }
          if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase/")) {
            return "vendor-firebase";
          }
          if (id.includes("node_modules/leaflet") || id.includes("node_modules/react-leaflet") || id.includes("node_modules/@react-leaflet/")) {
            return "vendor-maps";
          }
          if (id.includes("node_modules/@capacitor/")) {
            return "vendor-capacitor";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          if (id.includes("node_modules/zod")) {
            return "vendor-zod";
          }
          if (id.includes("node_modules/date-fns")) {
            return "vendor-dates";
          }
          if (id.includes("node_modules/cmdk")) {
            return "vendor-cmdk";
          }
          if (id.includes("node_modules/@react-oauth/") || id.includes("node_modules/oauth")) {
            return "vendor-oauth";
          }
          if (id.includes("node_modules/wouter")) {
            return "vendor-router";
          }
          if (id.includes("/lib/i18n/") || id.includes("@workspace/i18n")) {
            return "vendor-i18n";
          }
        },
      },
    },
  },
  optimizeDeps: {
    force: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "Cache-Control": "no-store",
    },
    hmr: process.env.REPLIT_DEV_DOMAIN
      ? { clientPort: 443, protocol: "wss", host: process.env.REPLIT_DEV_DOMAIN }
      : { port: port },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
      "/rider/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
        rewrite: (requestPath) => requestPath.replace(/^\/rider\/api/, "/api"),
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  };
});
