import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import session from "express-session";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env');

// Load .env file if it exists (optional in production where env vars are injected)
import { existsSync } from 'fs';
if (existsSync(envPath)) {
  const result = config({ path: envPath, debug: false });
  if (result.error) {
    console.warn('Warning loading .env file:', result.error.message);
  }
} else if (process.env.NODE_ENV !== 'production') {
  console.warn('No .env file found at', envPath);
}

const app = express();
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(compression());
// Limit request body size to prevent abuse
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Session middleware (keep for potential future use)
app.use(session({
  secret: process.env.SESSION_SECRET || "a-secret-key-for-sessions-that-is-long-and-secure",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: app.get("env") === "production" },
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    // The reusePort option is not supported on Windows
    reusePort: os.platform() !== "win32",
  }, () => {
    log(`serving on port ${port}`);
  });
})();