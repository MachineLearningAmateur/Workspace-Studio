import express from "express";
import { chatRouter } from "./routes/chat.js";
import { codeVisualizationsRouter } from "./routes/codeVisualizations.js";
import { jobApplicationsRouter } from "./routes/jobApplications.js";
import { knowledgeBaseRouter } from "./routes/knowledgeBase.js";
import { learningSessionsRouter } from "./routes/learningSessions.js";
import { plansRouter } from "./routes/plans.js";
import { profileRouter } from "./routes/profile.js";
import { sourcesRouter } from "./routes/sources.js";
import { trackerRouter, trackerErrorHandler } from "./routes/tracker.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { getTrackerCsvPath } from "./services/csvStore.js";
import { cleanupRemovedFeatureData, ensurePlanRegistry, getPlanRegistryPath } from "./services/planStore.js";
import { ensureWorkspaceRegistry, getWorkspaceRegistryPath } from "./services/workspaceStore.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/chat", chatRouter);
app.use("/api/code-visualizations", codeVisualizationsRouter);
app.use("/api/job-applications", jobApplicationsRouter);
app.use("/api/knowledge-base", knowledgeBaseRouter);
app.use("/api/learning-sessions", learningSessionsRouter);
app.use("/api/plans", plansRouter);
app.use("/api/profile", profileRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/tracker", trackerRouter);
app.use("/api/workspaces", workspacesRouter);
app.use(trackerErrorHandler);

await ensurePlanRegistry();
await cleanupRemovedFeatureData();
await ensureWorkspaceRegistry();

app.listen(port, () => {
  console.log(`Tracker API listening on http://127.0.0.1:${port}`);
  console.log(`Using CSV file at ${getTrackerCsvPath()}`);
  console.log(`Using plan registry at ${getPlanRegistryPath()}`);
  console.log(`Using workspace registry at ${getWorkspaceRegistryPath()}`);
});
