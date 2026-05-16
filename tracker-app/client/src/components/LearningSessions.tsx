import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyLearningEvaluation,
  createCodeVisualization,
  createLearningSession,
  deleteLearningSession,
  getKnowledgeBase,
  getLearningSession,
  getLearningSessionJob,
  getLearningSessionJobs,
  getLearningSessions,
  rebuildKnowledgeBase,
  startLearningSessionJob,
  updateWorkspaceCard
} from "../api/trackerApi";
import { MarkdownContent } from "./MarkdownContent";
import type { GuidedLaunchRequest } from "./ChatWorkspace";
import { CodeVisualizerModal } from "./CodeVisualizerModal";
import {
  type CodeVisualizationResponse,
  labelFor,
  results,
  statuses,
  type ActivityRow,
  type KnowledgeBaseSnapshot,
  type LearningSession,
  type LearningSessionEvaluation,
  type LearningSessionJobSnapshot,
  type WorkspaceCard,
  type WorkspaceSummary
} from "../types/tracker";
import { preserveWindowScroll } from "../utils/scroll";
import { insertTabInTextarea } from "../utils/textarea";

interface LearningSessionsProps {
  rows: ActivityRow[];
  cards: WorkspaceCard[];
  workspace: WorkspaceSummary;
  selectedPlanId: string;
  selectedWorkspaceId?: string;
  onRowsChanged: () => void;
  onCardsChanged: () => void;
  guidedLaunchRequest: GuidedLaunchRequest | null;
  onGuidedLaunchHandled: (token: string) => void;
}

const emptyEvaluation: LearningSessionEvaluation = {
  status: "review_again",
  confidence: "",
  time_spent_min: "",
  result: "explained_only",
  notes: "",
  strengths: "",
  weaknesses: "",
  next_focus: ""
};
const learningSidebarCollapsedStorageKey = "careerprep-learning-sidebar-collapsed";
type LearningPanelView = "content" | "activity";

export function LearningSessions({
  rows,
  cards,
  workspace,
  selectedPlanId,
  selectedWorkspaceId,
  onRowsChanged,
  onCardsChanged,
  guidedLaunchRequest,
  onGuidedLaunchHandled
}: LearningSessionsProps) {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastHandledLaunchTokenRef = useRef<string>("");
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [activeSession, setActiveSession] = useState<LearningSession | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseSnapshot | null>(null);
  const [jobsById, setJobsById] = useState<Record<string, LearningSessionJobSnapshot>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>(() => readMessageDrafts());
  const [taskSearch, setTaskSearch] = useState("");
  const [evaluationDraft, setEvaluationDraft] = useState<LearningSessionEvaluation>(emptyEvaluation);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [panelView, setPanelView] = useState<LearningPanelView>("content");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readBooleanPreference(learningSidebarCollapsedStorageKey));
  const [visualizerState, setVisualizerState] = useState<{
    title: string;
    isLoading: boolean;
    error: string | null;
    visualization: CodeVisualizationResponse | null;
  } | null>(null);
  const [visualizerStepIndex, setVisualizerStepIndex] = useState(0);

  const activeJobs = useMemo(() => Object.values(jobsById).filter(isActiveJob), [jobsById]);
  const activeJobIds = useMemo(() => activeJobs.map((job) => job.id).sort().join("|"), [activeJobs]);
  const activeSessionJobs = useMemo(
    () =>
      activeSession
        ? Object.values(jobsById)
            .filter((job) => job.session_id === activeSession.id)
            .sort(sortJobsNewestFirst)
        : [],
    [activeSession?.id, jobsById]
  );
  const activeSessionHasActiveJob = activeSessionJobs.some(isActiveJob);
  const activeSessionMessage = activeSession ? messageDrafts[activeSession.id] ?? "" : "";

  const scopeKey = selectedPlanId || selectedWorkspaceId || "global";
  const learningSessionScope = useMemo(
    () => ({
      planId: selectedPlanId || undefined,
      workspaceId: selectedPlanId ? undefined : selectedWorkspaceId || undefined
    }),
    [selectedPlanId, selectedWorkspaceId]
  );
  const availableItems = useMemo(() => {
    const normalizedSearch = taskSearch.trim().toLowerCase();
    if (selectedPlanId) {
      return rows
        .filter((row) => {
          if (!normalizedSearch) return true;
          return `${row.item_name} ${row.category} ${row.pattern} ${row.notes}`.toLowerCase().includes(normalizedSearch);
        })
        .map((row) => ({
          id: `row-${row.row_index}`,
          title: row.item_name,
          subtitle: `${labelFor(row.category)} - ${labelFor(row.status)}`,
          row
        }));
    }

    return cards
      .filter((card) => {
        if (!normalizedSearch) return true;
        return `${card.title} ${card.notes} ${card.subject_id} ${card.tags.join(" ")} ${Object.values(card.metadata).join(" ")}`
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .map((card) => ({
        id: `card-${card.id}`,
        title: card.title,
        subtitle: `${labelFor(card.subject_id)} - ${labelFor(card.status)}`,
        card
      }));
  }, [cards, rows, selectedPlanId, taskSearch]);

  useEffect(() => {
    void loadSessionState();
  }, [scopeKey]);

  useEffect(() => {
    if (!guidedLaunchRequest || (!guidedLaunchRequest.row && !guidedLaunchRequest.card)) {
      return;
    }

    if (lastHandledLaunchTokenRef.current === guidedLaunchRequest.token) {
      return;
    }

    lastHandledLaunchTokenRef.current = guidedLaunchRequest.token;
    void launchGuidedSession(guidedLaunchRequest);
  }, [guidedLaunchRequest?.token]);

  useEffect(() => {
    if (activeSession?.evaluation) {
      setEvaluationDraft(activeSession.evaluation);
    } else if (activeSession?.approved_evaluation) {
      setEvaluationDraft(activeSession.approved_evaluation);
    } else {
      setEvaluationDraft(emptyEvaluation);
    }
  }, [activeSession?.id, activeSession?.evaluation, activeSession?.approved_evaluation]);

  useEffect(() => {
    if (!activeJobIds) {
      return;
    }

    const jobIds = activeJobIds.split("|").filter(Boolean);
    const intervalId = window.setInterval(() => {
      void refreshJobs(jobIds);
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [activeJobIds]);

  useEffect(() => {
    resizeTextareaToContent(messageInputRef.current);
  }, [activeSession?.id, activeSessionMessage]);

  useEffect(() => {
    if (!activeSessionJobs.length && panelView === "activity") {
      setPanelView("content");
    }
  }, [activeSession?.id, activeSessionJobs.length, panelView]);

  async function loadSessionState() {
    setError(null);
    setJobsById({});

    try {
      const [nextSessions, nextKnowledgeBase, nextJobs] = await Promise.all([
        getLearningSessions(learningSessionScope),
        getKnowledgeBase(),
        getLearningSessionJobs({ ...learningSessionScope, active: true })
      ]);
      setSessions(nextSessions);
      setKnowledgeBase(nextKnowledgeBase);
      setJobsById(indexJobs(nextJobs));

      const storedSessionId = getStoredActiveSessionId(scopeKey);
      setActiveSession(nextSessions.find((session) => session.id === storedSessionId) ?? nextSessions[0] ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load learning sessions");
    }
  }

  async function startSession(target: { row: ActivityRow } | { card: WorkspaceCard }) {
    setIsStarting(true);
    setError(null);

    try {
      if ("card" in target && target.card.status !== "in_progress" && selectedWorkspaceId) {
        await updateWorkspaceCard(selectedWorkspaceId, target.card.id, { status: "in_progress" });
        await onCardsChanged();
      }

      const session =
        "row" in target
          ? await createLearningSession({ planId: selectedPlanId, rowIndex: target.row.row_index })
          : await createLearningSession({
              workspaceId: selectedWorkspaceId || workspace.id,
              cardId: target.card.id
            });
      setActiveSession(session);
      storeActiveSessionId(scopeKey, session.id);
      setSessions((currentSessions) => [session, ...currentSessions]);
      rememberJob(await startLearningSessionJob({ sessionId: session.id, type: "draft_lesson" }));
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start learning session");
    } finally {
      setIsStarting(false);
    }
  }

  async function launchGuidedSession(request: GuidedLaunchRequest) {
    try {
      if (request.row) {
        await startSession({ row: request.row });
      } else if (request.card) {
        await startSession({ card: request.card });
      }
    } finally {
      onGuidedLaunchHandled(request.token);
    }
  }

  async function selectSession(sessionId: string) {
    setError(null);

    try {
      const session = await getLearningSession(sessionId);
      setActiveSession(session);
      storeActiveSessionId(scopeKey, session.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load learning session");
    }
  }

  async function removeSession(session: LearningSession) {
    if (!window.confirm(`Delete learning session "${session.title}"?`)) {
      return;
    }

    setError(null);

    try {
      await deleteLearningSession(session.id);
      const nextSessions = sessions.filter((candidate) => candidate.id !== session.id);
      setSessions(nextSessions);
      forgetJobsForSession(session.id);
      setMessageDraft(session.id, "");
      if (activeSession?.id === session.id) {
        const nextActiveSession = nextSessions[0] ?? null;
        setActiveSession(nextActiveSession);
        storeActiveSessionId(scopeKey, nextActiveSession?.id ?? "");
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete learning session");
    }
  }

  async function sendMessage() {
    if (!activeSessionMessage.trim() || !activeSession) return;

    setError(null);

    try {
      const job = await startLearningSessionJob({ sessionId: activeSession.id, type: "message", prompt: activeSessionMessage });
      setMessageDraft(activeSession.id, "");
      rememberJob(job);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send learning prompt");
    }
  }

  async function requestEvaluation() {
    if (!activeSession) return;

    setError(null);

    try {
      rememberJob(await startLearningSessionJob({ sessionId: activeSession.id, type: "evaluation" }));
    } catch (evaluationError) {
      setError(evaluationError instanceof Error ? evaluationError.message : "Unable to request evaluation");
    }
  }

  async function refreshJobs(jobIds: string[]) {
    await Promise.all(jobIds.map((jobId) => refreshJob(jobId)));
  }

  async function refreshJob(jobId: string) {
    try {
      const job = await getLearningSessionJob(jobId);
      preserveWindowScroll(() => rememberJob(job));

      if (job.status === "completed" || job.status === "failed") {
        const updatedSession = job.session ?? (await getLearningSession(job.session_id));
        preserveWindowScroll(() => mergeUpdatedSession(updatedSession));

        if (job.status === "failed") {
          setError(job.error ?? "Learning session job failed");
        }
      }
    } catch (jobError) {
      const message = jobError instanceof Error ? jobError.message : "Unable to read learning session job";
      setJobsById((currentJobs) => {
        const nextJobs = { ...currentJobs };
        delete nextJobs[jobId];
        return nextJobs;
      });
      setError(message);
    }
  }

  async function applyEvaluation() {
    if (!activeSession) return;

    setIsApplying(true);
    setError(null);

    try {
      const result = await applyLearningEvaluation(activeSession.id, evaluationDraft);
      setActiveSession(result.session);
      setKnowledgeBase(result.knowledgeBase);
      setSessions((currentSessions) => currentSessions.map((session) => (session.id === result.session.id ? result.session : session)));
      if (result.row) {
        onRowsChanged();
      }
      if (result.card) {
        onCardsChanged();
      }
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unable to apply evaluation");
    } finally {
      setIsApplying(false);
    }
  }

  async function rebuildKnowledge() {
    setIsRebuilding(true);
    setError(null);

    try {
      setKnowledgeBase(await rebuildKnowledgeBase());
    } catch (rebuildError) {
      setError(rebuildError instanceof Error ? rebuildError.message : "Unable to rebuild knowledge base");
    } finally {
      setIsRebuilding(false);
    }
  }

  async function restartDraftLesson(session: LearningSession) {
    setError(null);

    try {
      rememberJob(await startLearningSessionJob({ sessionId: session.id, type: "draft_lesson" }));
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Unable to draft lesson");
    }
  }

  async function openCodeVisualization(messageId: string, role: "user" | "codex", codeBlockIndex: number) {
    if (!activeSession) {
      return;
    }

    setVisualizerState({
      title: `Guided session message from ${role === "codex" ? "Codex" : "You"}`,
      isLoading: true,
      error: null,
      visualization: null
    });
    setVisualizerStepIndex(0);

    try {
      const visualization = await createCodeVisualization({
        sourceType: "learning_session",
        sessionId: activeSession.id,
        messageId,
        codeBlockIndex
      });
      setVisualizerState({
        title: `Guided session message from ${role === "codex" ? "Codex" : "You"}`,
        isLoading: false,
        error: null,
        visualization
      });
    } catch (visualizationError) {
      setVisualizerState({
        title: `Guided session message from ${role === "codex" ? "Codex" : "You"}`,
        isLoading: false,
        error: visualizationError instanceof Error ? visualizationError.message : "Unable to visualize code",
        visualization: null
      });
    }
  }

  function rememberJob(job: LearningSessionJobSnapshot) {
    setJobsById((currentJobs) => ({ ...currentJobs, [job.id]: job }));

    if (job.session) {
      mergeUpdatedSession(job.session);
    }
  }

  function forgetJobsForSession(sessionId: string) {
    setJobsById((currentJobs) => Object.fromEntries(Object.entries(currentJobs).filter(([, job]) => job.session_id !== sessionId)));
  }

  function mergeUpdatedSession(updatedSession: LearningSession) {
    setActiveSession((currentSession) => (currentSession?.id === updatedSession.id ? updatedSession : currentSession));
    setSessions((currentSessions) => {
      if (currentSessions.some((session) => session.id === updatedSession.id)) {
        return currentSessions.map((session) => (session.id === updatedSession.id ? updatedSession : session));
      }

      return [updatedSession, ...currentSessions];
    });
  }

  function setMessageDraft(sessionId: string, value: string) {
    setMessageDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };

      if (value) {
        nextDrafts[sessionId] = value;
      } else {
        delete nextDrafts[sessionId];
      }

      writeMessageDrafts(nextDrafts);
      return nextDrafts;
    });
  }

  function updateEvaluation<K extends keyof LearningSessionEvaluation>(key: K, value: LearningSessionEvaluation[K]) {
    setEvaluationDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className={`learning-sessions ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`} aria-label="Learning sessions">
      <aside className="learning-sidebar">
        <div className="section-heading compact-heading">
          <div>
            <h2>Tasks</h2>
            <p>{selectedPlanId ? "Choose one tracker task and draft a guided Codex session." : "Choose one board card and draft a guided Codex session."}</p>
          </div>
        </div>

        <label>
          Find a task
          <input
            value={taskSearch}
            onChange={(event) => setTaskSearch(event.target.value)}
            placeholder={selectedPlanId ? "Search tasks, patterns, notes" : "Search card titles, notes, tags"}
          />
        </label>

        <div className="task-picker">
          {availableItems.length === 0 ? <p className="empty-state">{selectedPlanId ? "No matching tracker tasks." : "No matching board cards."}</p> : null}
          {availableItems.slice(0, 80).map((item) => (
            <button
              type="button"
              key={item.id}
              disabled={isStarting}
              onClick={() => void startSession("row" in item ? { row: item.row } : { card: item.card })}
            >
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
            </button>
          ))}
        </div>

        <div className="source-library">
          <h3>Learning Sessions</h3>
          <div className="session-list">
            {sessions.length === 0 ? <p>No sessions yet.</p> : null}
            {sessions.map((session) => (
              <div className="session-row" key={session.id}>
                <button
                  className={activeSession?.id === session.id ? "active-session" : ""}
                  type="button"
                  onClick={() => void selectSession(session.id)}
                >
                  {session.title}
                  <SessionJobBadge jobs={activeJobs.filter((job) => job.session_id === session.id)} />
                </button>
                <button className="danger-button" type="button" onClick={() => void removeSession(session)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="learning-main">
        {error ? (
          <section className="alert" role="alert">
            {error}
          </section>
        ) : null}

        <div className="sidebar-toggle-row">
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              const nextValue = !isSidebarCollapsed;
              setIsSidebarCollapsed(nextValue);
              writeBooleanPreference(learningSidebarCollapsedStorageKey, nextValue);
            }}
          >
            {isSidebarCollapsed ? "Show left sidebar" : "Hide left sidebar"}
          </button>
        </div>

        {activeSession ? (
          <>
            <section className="chat-context-bar">
              <span>{activeSession.title}</span>
              <span>{labelFor(activeSession.status)}</span>
            </section>

            <LearningPanelTabs
              activeView={panelView}
              activityAvailable={activeSessionJobs.length > 0}
              onSelect={setPanelView}
            />

            {panelView === "activity" && activeSessionJobs.length ? (
              <LearningActivityPanel jobs={activeSessionJobs} />
            ) : (
              <>
                <div className="message-list" aria-label="Learning transcript">
                  {activeSession.messages.length === 0 ? (
                    <p className="empty-state">
                      {activeSession.status === "drafting"
                        ? "The lesson draft will appear here when Codex finishes. Watch Codex activity above while it works."
                        : "No transcript messages yet."}
                    </p>
                  ) : (
                    activeSession.messages.map((entry) => (
                      <article className={`chat-message ${entry.role === "user" ? "user" : "assistant"}`} key={entry.id}>
                        <div className="message-meta">
                          <strong>{entry.role === "user" ? "You" : "Codex"}</strong>
                          <time dateTime={entry.created_at}>{formatTime(entry.created_at)}</time>
                        </div>
                        <MarkdownContent
                          content={entry.content}
                          onVisualizeCodeBlock={({ codeBlockIndex }) => void openCodeVisualization(entry.id, entry.role, codeBlockIndex)}
                        />
                      </article>
                    ))
                  )}
                </div>
                <CodeVisualizerModal
                  state={visualizerState}
                  currentStepIndex={visualizerStepIndex}
                  onClose={() => setVisualizerState(null)}
                  onStepChange={setVisualizerStepIndex}
                />
              </>
            )}

            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <label>
                Work with Codex
                <textarea
                  ref={messageInputRef}
                  className="auto-grow-textarea"
                  rows={4}
                  value={activeSessionMessage}
                  placeholder="Answer the checkpoint, ask for a hint, or say what feels unclear."
                  onChange={(event) => setMessageDraft(activeSession.id, event.target.value)}
                  onKeyDown={(event) => insertTabInTextarea(event, (value) => setMessageDraft(activeSession.id, value))}
                />
              </label>
              <div className="form-actions">
                {activeSession.status === "drafting" ? (
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={activeSessionHasActiveJob}
                    onClick={() => void restartDraftLesson(activeSession)}
                  >
                    Draft lesson
                  </button>
                ) : null}
                <button className="ghost-button" type="button" disabled={!activeSession.messages.length} onClick={() => void requestEvaluation()}>
                  Review my understanding
                </button>
                <button className="primary-button" type="submit" disabled={!activeSessionMessage.trim()}>
                  {activeSessionHasActiveJob ? "Queue message" : "Send"}
                </button>
              </div>
            </form>

            <EvaluationEditor
              evaluation={evaluationDraft}
              isApplying={isApplying}
              canApply={Boolean(activeSession.evaluation) && !activeSessionHasActiveJob}
              applyDisabledReason={getApplyDisabledReason({
                hasEvaluation: Boolean(activeSession.evaluation),
                hasActiveJob: activeSessionHasActiveJob
              })}
              onChange={updateEvaluation}
              onApply={() => void applyEvaluation()}
            />
          </>
        ) : (
          <p className="empty-state">Start a session from a tracker task.</p>
        )}

        <section className="knowledge-base">
          <div className="section-heading compact-heading">
            <div>
              <h2>Knowledge Base</h2>
              <p>Approved session reviews are catalogued here for future plan generation.</p>
            </div>
            <button className="ghost-button" type="button" disabled={isRebuilding} onClick={() => void rebuildKnowledge()}>
              {isRebuilding ? "Rebuilding..." : "Rebuild"}
            </button>
          </div>
          <pre>{knowledgeBase?.content || "No approved learning evaluations yet."}</pre>
        </section>
      </div>
    </section>
  );
}

function LearningPanelTabs({
  activeView,
  activityAvailable,
  onSelect
}: {
  activeView: LearningPanelView;
  activityAvailable: boolean;
  onSelect: (view: LearningPanelView) => void;
}) {
  return (
    <div className="chat-panel-tabs" role="tablist" aria-label="Learning session panel">
      <button
        className={activeView === "content" ? "active-panel" : ""}
        type="button"
        role="tab"
        aria-selected={activeView === "content"}
        onClick={() => onSelect("content")}
      >
        Codex
      </button>
      <button
        className={activeView === "activity" ? "active-panel" : ""}
        type="button"
        role="tab"
        aria-selected={activeView === "activity"}
        disabled={!activityAvailable}
        onClick={() => onSelect("activity")}
      >
        Codex activity
      </button>
    </div>
  );
}

function LearningActivityPanel({ jobs }: { jobs: LearningSessionJobSnapshot[] }) {
  const entries = jobs
    .flatMap((job) =>
      job.messages.map((entry) => ({
        ...entry,
        job
      }))
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latestJob = jobs[0];

  return (
    <section className="codex-progress live-codex-progress" aria-label="Codex learning progress" aria-live="polite">
      <div className="codex-progress-header">
        <div>
          <span>Codex activity</span>
          <strong>{summarizeJobs(jobs)}</strong>
        </div>
        {latestJob ? <small>Updated {formatTime(latestJob.updated_at)}</small> : null}
      </div>
      {entries.length ? (
        <ol>
          {entries.map((entry) => (
            <li key={`${entry.job.id}-${entry.timestamp}-${entry.message}`}>
              <time dateTime={entry.timestamp}>{formatTime(entry.timestamp)}</time>
              <span className="activity-source">{labelFor(entry.job.type)}</span>
              <p>{entry.message}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>Waiting for Codex to report progress.</p>
      )}
    </section>
  );
}

function SessionJobBadge({ jobs }: { jobs: LearningSessionJobSnapshot[] }) {
  const activeJobs = jobs.filter(isActiveJob);

  if (activeJobs.length === 0) {
    return null;
  }

  return <span className="session-job-badge">{activeJobs.length === 1 ? labelFor(activeJobs[0].status) : `${activeJobs.length} jobs`}</span>;
}

function EvaluationEditor({
  evaluation,
  isApplying,
  canApply,
  applyDisabledReason,
  onChange,
  onApply
}: {
  evaluation: LearningSessionEvaluation;
  isApplying: boolean;
  canApply: boolean;
  applyDisabledReason: string;
  onChange: <K extends keyof LearningSessionEvaluation>(key: K, value: LearningSessionEvaluation[K]) => void;
  onApply: () => void;
}) {
  return (
    <section className="evaluation-editor" aria-label="Session evaluation">
      <div className="section-heading compact-heading">
        <div>
          <h2>Session Review</h2>
          <p>Approve Codex's assessment to update the tracker row and knowledge base.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={!canApply || isApplying}
          title={!canApply && !isApplying ? applyDisabledReason : undefined}
          onClick={onApply}
        >
          {isApplying ? "Applying..." : "Apply to tracker"}
        </button>
      </div>
      {!canApply ? <p>{applyDisabledReason}</p> : null}

      <div className="evaluation-grid">
        <label>
          Status
          <select value={evaluation.status} onChange={(event) => onChange("status", event.target.value as LearningSessionEvaluation["status"])}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {labelFor(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Confidence
          <select value={evaluation.confidence} onChange={(event) => onChange("confidence", event.target.value)}>
            <option value="">Not set</option>
            <option value="1">1 - shaky</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5 - solid</option>
          </select>
        </label>
        <label>
          Result
          <select value={evaluation.result} onChange={(event) => onChange("result", event.target.value as LearningSessionEvaluation["result"])}>
            <option value="">Not set</option>
            {results.map((result) => (
              <option key={result} value={result}>
                {labelFor(result)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Time spent
          <input value={evaluation.time_spent_min} inputMode="numeric" onChange={(event) => onChange("time_spent_min", event.target.value)} />
        </label>
        <label className="wide-field">
          Notes
          <textarea rows={3} value={evaluation.notes} onChange={(event) => onChange("notes", event.target.value)} />
        </label>
        <label className="wide-field">
          Strengths
          <textarea rows={3} value={evaluation.strengths} onChange={(event) => onChange("strengths", event.target.value)} />
        </label>
        <label className="wide-field">
          Weak areas
          <textarea rows={3} value={evaluation.weaknesses} onChange={(event) => onChange("weaknesses", event.target.value)} />
        </label>
        <label className="wide-field">
          Next focus
          <textarea rows={3} value={evaluation.next_focus} onChange={(event) => onChange("next_focus", event.target.value)} />
        </label>
      </div>
    </section>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function resizeTextareaToContent(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return;
  }

  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

const messageDraftsStorageKey = "careerprep-learning-message-drafts";
const activeSessionStoragePrefix = "careerprep-active-learning-session:";

function isActiveJob(job: LearningSessionJobSnapshot) {
  return job.status === "queued" || job.status === "running";
}

function indexJobs(jobs: LearningSessionJobSnapshot[]) {
  return Object.fromEntries(jobs.map((job) => [job.id, job]));
}

function sortJobsNewestFirst(a: LearningSessionJobSnapshot, b: LearningSessionJobSnapshot) {
  return b.updated_at.localeCompare(a.updated_at);
}

function summarizeJobs(jobs: LearningSessionJobSnapshot[]) {
  const activeJobs = jobs.filter(isActiveJob);

  if (activeJobs.length > 1) {
    return `${activeJobs.length} active jobs`;
  }

  const job = activeJobs[0] ?? jobs[0];
  return job ? `${labelFor(job.type)} - ${labelFor(job.status)}` : "";
}

function readMessageDrafts() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(messageDraftsStorageKey) ?? "{}") as unknown;
    return isStringRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeMessageDrafts(drafts: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(messageDraftsStorageKey, JSON.stringify(drafts));
}

function getStoredActiveSessionId(planId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(`${activeSessionStoragePrefix}${planId}`) ?? "";
}

function storeActiveSessionId(planId: string, sessionId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const key = `${activeSessionStoragePrefix}${planId}`;

  if (sessionId) {
    window.localStorage.setItem(key, sessionId);
  } else {
    window.localStorage.removeItem(key);
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function getApplyDisabledReason(input: { hasEvaluation: boolean; hasActiveJob: boolean }) {
  if (input.hasActiveJob) {
    return "Wait for the active Codex job to finish before applying changes to the tracker.";
  }

  if (!input.hasEvaluation) {
    return 'Run "Review my understanding" first so Codex produces a session evaluation to apply.';
  }

  return "";
}

function readBooleanPreference(key: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "1";
}

function writeBooleanPreference(key: string, value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(key, "1");
    return;
  }

  window.localStorage.removeItem(key);
}
