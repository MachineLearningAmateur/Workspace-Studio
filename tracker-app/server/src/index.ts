import express from "express";
import { trackerRouter, trackerErrorHandler } from "./routes/tracker.js";
import { ensureTrackerFile, getTrackerCsvPath } from "./services/csvStore.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/tracker", trackerRouter);
app.use(trackerErrorHandler);

await ensureTrackerFile();

app.listen(port, () => {
  console.log(`Tracker API listening on http://127.0.0.1:${port}`);
  console.log(`Using CSV file at ${getTrackerCsvPath()}`);
});
