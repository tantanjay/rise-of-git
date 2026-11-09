import "./env.js"; // must stay first: loads .env before other modules read it
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./routes.js";
import { backfillService } from "./backfillService.js";
import { refreshDevDailyStatsIfStale } from "./leaderboard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Room for a Realm Backup (every developer, email and deed ever written) on its import
app.use(express.json({ limit: "25mb" }));

// API router (supports both /castle/api and /api)
app.use("/castle/api", router);
app.use("/api", router);

// Serve static frontend build
const distPath = path.join(__dirname, "../../dist");

// Explicitly serve favicons for both root and /castle prefix
app.get(["/favicon.ico", "/castle/favicon.ico"], (_req, res) => {
  res.sendFile(path.join(distPath, "favicon.ico"));
});
app.get(["/favicon.svg", "/castle/favicon.svg"], (_req, res) => {
  res.sendFile(path.join(distPath, "favicon.svg"));
});

// Redirect /castle without trailing slash to /castle/ so relative asset paths resolve correctly
app.get("/castle", (req, res, next) => {
  if (!req.originalUrl.endsWith("/") && !req.originalUrl.includes("?")) {
    return res.redirect(301, req.originalUrl + "/");
  }
  next();
});

app.use(express.static(distPath));
app.use("/castle", express.static(distPath));

app.get(["/castle", "/castle/{*splat}", "/{*splat}"], (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) {
      res.status(200).send("Rise of Git server running. Start frontend via 'npm run dev:client' or build with 'npm run build'.");
    }
  });
});

// Anything a route didn't handle answers in plain JSON: no stack traces or server paths in the response
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const status = Number(err?.status ?? err?.statusCode) || 500;
  if (status >= 500) console.error("[Server] Unhandled error:", err);
  res.status(status).json({ error: status >= 500 ? "The realm hit an unexpected error" : "Bad request" });
});

const server = app.listen(PORT, () => {
  console.log(`🏰 Rise of Git server listening on http://localhost:${PORT}`);
});

// Hall of Renown daily stats: rebuilt shortly after start, on each new UTC day, and within a minute or two of new history (sync / backfill)
setTimeout(refreshDevDailyStatsIfStale, 15_000).unref();
setInterval(refreshDevDailyStatsIfStale, 60_000).unref();

function handleShutdown(signal: string) {
  console.log(`\n[Server] 🛑 Shutdown signal (${signal}) received. Stopping backfill worker & saving state...`);
  backfillService.stop();
  server.close(() => {
    console.log("[Server] 👋 Server closed cleanly. Checkpoint preserved.");
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
