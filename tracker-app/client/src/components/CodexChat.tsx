import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCodeVisualization,
  createChatSession,
  deleteChatSession,
  createSource,
  deleteSource,
  getChatJob,
  getChatSession,
  getChatSessions,
  getSources,
  saveChatPreview,
  startChatJob
} from "../api/trackerApi";
import type {
  ChatJobSnapshot,
  ChatMessage,
  ChatSession,
  CodeVisualizationResponse,
  MarkdownSource,
  PlanSummary
} from "../types/tracker";
import { preserveWindowScroll } from "../utils/scroll";
import { insertTabInTextarea } from "../utils/textarea";
import { CodeVisualizerModal } from "./CodeVisualizerModal";
import { MarkdownContent } from "./MarkdownContent";

interface CodexChatProps {
  plans: PlanSummary[];
  selectedPlanId: string;
  selectedWorkspaceId?: string;
  onPlanSaved: (plan: PlanSummary) => void;
}

interface ChatAttachment {
  filename: string;
  content: string;
}

const activeChatSessionStoragePrefix = "careerprep-active-chat-session";
const activeChatJobStoragePrefix = "careerprep-active-chat-job";
const chatSidebarCollapsedStorageKey = "careerprep-chat-sidebar-collapsed";
const chatDraftStoragePrefix = "careerprep-chat-draft-";
type ChatPanelView = "content" | "activity";

export function CodexChat({ plans, selectedPlanId, selectedWorkspaceId, onPlanSaved }: CodexChatProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sources, setSources] = useState<MarkdownSource[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [prompt, setPrompt] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [currentJob, setCurrentJob] = useState<ChatJobSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [savingPreviewId, setSavingPreviewId] = useState<string | null>(null);
  const [panelView, setPanelView] = useState<ChatPanelView>("content");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readBooleanPreference(chatSidebarCollapsedStorageKey));
  const [visualizerState, setVisualizerState] = useState<{
    title: string;
    isLoading: boolean;
    error: string | null;
    visualization: CodeVisualizationResponse | null;
  } | null>(null);
  const [visualizerStepIndex, setVisualizerStepIndex] = useState(0);

  const isJobRunning = currentJob?.status === "queued" || currentJob?.status === "running";
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId), [plans, selectedPlanId]);
  const chatScope = selectedWorkspaceId?.trim() || "global";

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    setPrompt(getStoredChatDraft(chatScope, activeSession.id));
  }, [activeSession?.id, chatScope]);

  useEffect(() => {
    void loadInitialChatState();
  }, [chatScope]);

  useEffect(() => {
    if (!isJobRunning || !currentJob) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshJob(currentJob.id);
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [currentJob?.id, isJobRunning]);

  async function loadInitialChatState() {
    setError(null);

    try {
      const [nextSources, nextSessions] = await Promise.all([getSources(), getChatSessions(selectedWorkspaceId)]);
      setSources(nextSources);

      if (nextSessions.length > 0) {
        const storedSessionId = getStoredActiveChatSessionId(chatScope);
        const restoredSession = nextSessions.find((session) => session.id === storedSessionId) ?? nextSessions[0];
        setSessions(nextSessions);
        setActiveChatSession(restoredSession);
        await restoreCurrentChatJob(restoredSession.id);
        return;
      }

      const session = await createChatSession({ workspaceId: selectedWorkspaceId });
      setSessions([session]);
      setActiveChatSession(session);
      await restoreCurrentChatJob(session.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load chat");
    }
  }

  async function selectSession(sessionId: string) {
    setError(null);

    try {
      const session = await getChatSession(sessionId);
      setActiveChatSession(session);
      if (currentJob?.session_id !== session.id) {
        setCurrentJob(null);
        setPanelView("content");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load chat session");
    }
  }

  async function newSession() {
    setError(null);

    try {
      const session = await createChatSession({ workspaceId: selectedWorkspaceId });
      setSessions((currentSessions) => [session, ...currentSessions]);
      setActiveChatSession(session);
      setCurrentJob(null);
      setPanelView("content");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create chat session");
    }
  }

  async function removeSession(session: ChatSession) {
    if (!window.confirm(`Delete chat session "${session.title}"?`)) {
      return;
    }

    setError(null);

    try {
      await deleteChatSession(session.id);
      const nextSessions = sessions.filter((candidate) => candidate.id !== session.id);
      setSessions(nextSessions);

      if (activeSession?.id === session.id) {
        setCurrentJob(null);
        setPanelView("content");

        if (nextSessions[0]) {
          setActiveChatSession(await getChatSession(nextSessions[0].id));
        } else {
          const nextSession = await createChatSession({ workspaceId: selectedWorkspaceId });
          setSessions([nextSession]);
          setActiveChatSession(nextSession);
        }
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete chat session");
    }
  }

  async function uploadSources(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setUploadMessage(null);

    try {
      const invalidFiles = files.filter((file) => !file.name.toLowerCase().endsWith(".md"));

      if (invalidFiles.length > 0) {
        throw new Error(`Only .md files can be uploaded: ${invalidFiles.map((file) => file.name).join(", ")}`);
      }

      const uploaded = await Promise.all(
        files.map(async (file) =>
          createSource({
            filename: file.name,
            content: await file.text()
          })
        )
      );
      setSources((currentSources) => [...uploaded, ...currentSources]);
      setSelectedSourceIds((currentIds) => [...currentIds, ...uploaded.map((source) => source.id)]);
      setUploadMessage(`Added ${uploaded.length} markdown source${uploaded.length === 1 ? "" : "s"}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload markdown source");
      setUploadMessage(uploadError instanceof Error ? uploadError.message : "Unable to upload markdown source");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function attachMarkdownFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setError(null);

    try {
      const nextAttachments = await readMarkdownAttachments(files);
      setAttachments((currentAttachments) => [...currentAttachments, ...nextAttachments]);
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "Unable to attach markdown files");
    } finally {
      event.target.value = "";
    }
  }

  async function removeSource(sourceId: string) {
    setError(null);

    try {
      await deleteSource(sourceId);
      setSources((currentSources) => currentSources.filter((source) => source.id !== sourceId));
      setSelectedSourceIds((currentIds) => currentIds.filter((id) => id !== sourceId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete markdown source");
    }
  }

  async function sendPrompt(mode: "general" | "adaptive_progress") {
    if (!prompt.trim() || !activeSession) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const job = await startChatJob({
        sessionId: activeSession.id,
        prompt,
        mode,
        planId: selectedPlanId,
        workspaceId: selectedWorkspaceId,
        sourceIds: selectedSourceIds,
        attachments,
        targetDate
      });
      setPrompt("");
      setAttachments([]);
      storeChatDraft(chatScope, activeSession.id, "");
      setStoredActiveChatJobId(chatScope, job.id);
      setCurrentJob(job);
      const updatedSession = await getChatSession(activeSession.id);
      preserveWindowScroll(() => {
        setActiveChatSession(updatedSession);
        updateSessionList(updatedSession);
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to start Codex chat");
      setIsSending(false);
    }
  }

  async function refreshJob(jobId: string) {
    try {
      const job = await getChatJob(jobId);
      preserveWindowScroll(() => setCurrentJob(job));

      if (job.status === "completed" || job.status === "failed") {
        setIsSending(false);
        clearStoredActiveChatJobId(chatScope);
        const updatedSession = await getChatSession(job.session_id);
        preserveWindowScroll(() => {
          setActiveChatSession(updatedSession);
          updateSessionList(updatedSession);
        });

        if (job.status === "failed") {
          setError(job.error ?? "Codex chat failed");
        }
      }
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : "Unable to read Codex chat job");
      setIsSending(false);
    }
  }

  async function savePreviewAsNewPlan(message: ChatMessage) {
    const planName = window.prompt("Name for the new plan", "Codex adaptive plan");
    if (!planName || !activeSession) return;

    setSavingPreviewId(message.id);
    setError(null);

    try {
      const plan = await saveChatPreview(activeSession.id, message.id, {
        action: "new_plan",
        planName,
        basePlanId: selectedPlanId
      });
      onPlanSaved(plan);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save preview");
    } finally {
      setSavingPreviewId(null);
    }
  }

  async function replaceSelectedPlan(message: ChatMessage) {
    if (!activeSession || !selectedPlan) return;
    if (!window.confirm(`Replace "${selectedPlan.name}" with this CSV preview?`)) return;

    setSavingPreviewId(message.id);
    setError(null);

    try {
      const plan = await saveChatPreview(activeSession.id, message.id, {
        action: "replace_plan",
        planId: selectedPlan.id
      });
      onPlanSaved(plan);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to replace selected plan");
    } finally {
      setSavingPreviewId(null);
    }
  }

  async function appendToSelectedPlan(message: ChatMessage) {
    if (!activeSession || !selectedPlan) return;
    if (!window.confirm(`Add this CSV preview to "${selectedPlan.name}"?`)) return;

    setSavingPreviewId(message.id);
    setError(null);

    try {
      const plan = await saveChatPreview(activeSession.id, message.id, {
        action: "append_plan",
        planId: selectedPlan.id
      });
      onPlanSaved(plan);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add preview to selected plan");
    } finally {
      setSavingPreviewId(null);
    }
  }

  async function openCodeVisualization(message: ChatMessage, codeBlockIndex: number) {
    if (!activeSession) {
      return;
    }

    setVisualizerState({
      title: `Message from ${message.role === "assistant" ? "Codex" : "You"}`,
      isLoading: true,
      error: null,
      visualization: null
    });
    setVisualizerStepIndex(0);

    try {
      const visualization = await createCodeVisualization({
        sourceType: "chat",
        sessionId: activeSession.id,
        messageId: message.id,
        codeBlockIndex
      });
      setVisualizerState({
        title: `Message from ${message.role === "assistant" ? "Codex" : "You"}`,
        isLoading: false,
        error: null,
        visualization
      });
    } catch (visualizationError) {
      setVisualizerState({
        title: `Message from ${message.role === "assistant" ? "Codex" : "You"}`,
        isLoading: false,
        error: visualizationError instanceof Error ? visualizationError.message : "Unable to visualize code",
        visualization: null
      });
    }
  }

  function toggleSource(sourceId: string) {
    setSelectedSourceIds((currentIds) =>
      currentIds.includes(sourceId) ? currentIds.filter((id) => id !== sourceId) : [...currentIds, sourceId]
    );
  }

  function removeAttachment(filename: string) {
    setAttachments((currentAttachments) => currentAttachments.filter((attachment) => attachment.filename !== filename));
  }

  function updatePrompt(value: string) {
    setPrompt(value);
    if (activeSession) {
      storeChatDraft(chatScope, activeSession.id, value);
    }
  }

  function setActiveChatSession(session: ChatSession) {
    setActiveSession(session);
    setStoredActiveChatSessionId(chatScope, session.id);
  }

  function updateSessionList(session: ChatSession) {
    setSessions((currentSessions) =>
      sortSessionsNewestFirst(
        currentSessions.some((candidate) => candidate.id === session.id)
          ? currentSessions.map((candidate) => (candidate.id === session.id ? session : candidate))
          : [session, ...currentSessions]
      )
    );
  }

  async function restoreCurrentChatJob(sessionId: string) {
    const jobId = getStoredActiveChatJobId(chatScope);

    if (!jobId) {
      return;
    }

    try {
      const job = await getChatJob(jobId);

      if (job.session_id !== sessionId || job.status === "failed") {
        clearStoredActiveChatJobId(chatScope);
        return;
      }

      setCurrentJob(job);

      if (job.status === "queued" || job.status === "running") {
        setIsSending(true);
        return;
      }

      clearStoredActiveChatJobId(chatScope);
      const updatedSession = await getChatSession(job.session_id);
      setActiveChatSession(updatedSession);
      updateSessionList(updatedSession);
    } catch {
      clearStoredActiveChatJobId(chatScope);
    }
  }

  return (
    <section className={`codex-chat ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`} aria-label="Codex chat">
      <div className="chat-sidebar">
        <div className="section-heading compact-heading">
          <div>
            <h2>Open Chat Sessions</h2>
            <p>Choose a saved chat, start a new one, or delete old chats.</p>
          </div>
          <button type="button" onClick={() => void newSession()}>
            New
          </button>
        </div>

        <div className="session-list">
          {sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <button
                className={activeSession?.id === session.id ? "active-session" : ""}
                type="button"
                onClick={() => void selectSession(session.id)}
              >
                {session.title}
              </button>
              <button
                className="danger-button"
                type="button"
                aria-label={`Delete chat session ${session.title}`}
                onClick={() => void removeSession(session)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className="source-library">
          <h3>Markdown Sources</h3>
          <div className="file-upload-control">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,text/markdown"
              multiple
              disabled={isUploading}
              onChange={(event) => void uploadSources(event)}
            />
            <button className="ghost-button" type="button" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
              {isUploading ? "Uploading..." : "Choose markdown files"}
            </button>
            <small>.md files only</small>
          </div>
          {uploadMessage ? <p className={error === uploadMessage ? "upload-message upload-error" : "upload-message"}>{uploadMessage}</p> : null}
          <div className="source-list">
            {sources.length === 0 ? <p>No sources uploaded.</p> : null}
            {sources.map((source) => (
              <div className="source-row" key={source.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedSourceIds.includes(source.id)}
                    onChange={() => toggleSource(source.id)}
                  />
                  {source.filename}
                </label>
                <button className="danger-button" type="button" onClick={() => void removeSource(source.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chat-main">
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
              writeBooleanPreference(chatSidebarCollapsedStorageKey, nextValue);
            }}
          >
            {isSidebarCollapsed ? "Show left sidebar" : "Hide left sidebar"}
          </button>
        </div>

        <div className="chat-context-bar">
          <span>Plan context: {selectedPlan?.name ?? "None"}</span>
          <span>{selectedSourceIds.length} sources selected</span>
        </div>

        <PanelTabs
          activeView={panelView}
          activityAvailable={Boolean(currentJob)}
          onSelect={setPanelView}
        />

        {panelView === "activity" && currentJob ? (
          <ChatActivityPanel job={currentJob} />
        ) : (
          <>
            <div className="message-list" aria-label="Chat messages">
              {activeSession?.messages.length ? (
                activeSession.messages.map((message) => (
                  <article className={`chat-message ${message.role}`} key={message.id}>
                    <div className="message-meta">
                      <strong>{message.role === "user" ? "You" : "Codex"}</strong>
                      <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                    </div>
                    <MarkdownContent
                      content={message.content}
                      onVisualizeCodeBlock={({ codeBlockIndex }) => void openCodeVisualization(message, codeBlockIndex)}
                    />
                    {message.preview ? (
                      <CsvPreviewPanel
                        message={message}
                        isSaving={savingPreviewId === message.id}
                        onSaveNew={() => void savePreviewAsNewPlan(message)}
                        onAppend={() => void appendToSelectedPlan(message)}
                        onReplace={() => void replaceSelectedPlan(message)}
                      />
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="empty-state">Start a chat to ask Codex about this prep plan.</p>
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
            void sendPrompt("general");
          }}
        >
          <label>
            Optional target date for plan requests
            <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </label>
          <label>
            Prompt
            <textarea
              rows={5}
              placeholder="Ask anything. Codex can write markdown notes, answer follow-ups, or generate a tracker plan when requested."
              value={prompt}
              onChange={(event) => updatePrompt(event.target.value)}
              onKeyDown={(event) => insertTabInTextarea(event, updatePrompt)}
            />
          </label>
          <section className="composer-attachments" aria-label="Markdown attachments">
            <div className="composer-attachment-header">
              <div>
                <strong>Attach markdown to this message</strong>
                <small>One-off files are sent with this prompt and are not saved to the source library.</small>
              </div>
              <input
                id="chat-attachment-input"
                type="file"
                accept=".md,text/markdown,text/plain"
                multiple
                onChange={(event) => void attachMarkdownFiles(event)}
              />
              <label className="button-like ghost-button" htmlFor="chat-attachment-input">
                Attach .md
              </label>
            </div>
            {attachments.length ? (
              <div className="attachment-list">
                {attachments.map((attachment) => (
                  <span className="attachment-chip" key={attachment.filename}>
                    {attachment.filename}
                    <button type="button" aria-label={`Remove attachment ${attachment.filename}`} onClick={() => removeAttachment(attachment.filename)}>
                      Remove
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </section>
          <div className="form-actions">
            <button className="ghost-button" type="button" disabled={isSending || !prompt.trim()} onClick={() => void sendPrompt("adaptive_progress")}>
              Use progress for plan
            </button>
            <button className="primary-button" type="submit" disabled={isSending || !prompt.trim()}>
              {isSending ? "Working..." : "Ask Codex"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function PanelTabs({
  activeView,
  activityAvailable,
  onSelect
}: {
  activeView: ChatPanelView;
  activityAvailable: boolean;
  onSelect: (view: ChatPanelView) => void;
}) {
  return (
    <div className="chat-panel-tabs" role="tablist" aria-label="Chat panel">
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

function ChatActivityPanel({ job }: { job: ChatJobSnapshot }) {
  return (
    <section className="codex-progress chat-progress" aria-label="Codex chat progress" aria-live="polite">
      <div className="codex-progress-header">
        <div>
          <span>Codex status</span>
          <strong>{formatJobStatus(job.status)}</strong>
        </div>
        <small>Updated {formatTime(job.updated_at)}</small>
      </div>
      {job.messages.length ? (
        <ol>
          {job.messages.map((entry) => (
            <li key={`${entry.timestamp}-${entry.message}`}>
              <time dateTime={entry.timestamp}>{formatTime(entry.timestamp)}</time>
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

function setStoredActiveChatSessionId(scope: string, sessionId: string) {
  window.localStorage.setItem(`${activeChatSessionStoragePrefix}-${scope}`, sessionId);
}

function getStoredActiveChatSessionId(scope: string) {
  return window.localStorage.getItem(`${activeChatSessionStoragePrefix}-${scope}`) ?? "";
}

function setStoredActiveChatJobId(scope: string, jobId: string) {
  window.localStorage.setItem(`${activeChatJobStoragePrefix}-${scope}`, jobId);
}

function getStoredActiveChatJobId(scope: string) {
  return window.localStorage.getItem(`${activeChatJobStoragePrefix}-${scope}`) ?? "";
}

function clearStoredActiveChatJobId(scope: string) {
  window.localStorage.removeItem(`${activeChatJobStoragePrefix}-${scope}`);
}

function sortSessionsNewestFirst(sessions: ChatSession[]) {
  return [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function readMarkdownAttachments(files: File[]) {
  const invalidFiles = files.filter((file) => !file.name.toLowerCase().endsWith(".md"));

  if (invalidFiles.length > 0) {
    throw new Error(`Only .md files can be attached: ${invalidFiles.map((file) => file.name).join(", ")}`);
  }

  return Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      content: await file.text()
    }))
  );
}

function getStoredChatDraft(scope: string, sessionId: string) {
  return window.localStorage.getItem(`${chatDraftStoragePrefix}${scope}-${sessionId}`) ?? "";
}

function storeChatDraft(scope: string, sessionId: string, draft: string) {
  const key = `${chatDraftStoragePrefix}${scope}-${sessionId}`;

  if (draft.trim()) {
    window.localStorage.setItem(key, draft);
    return;
  }

  window.localStorage.removeItem(key);
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

function CsvPreviewPanel({
  message,
  isSaving,
  onSaveNew,
  onAppend,
  onReplace
}: {
  message: ChatMessage;
  isSaving: boolean;
  onSaveNew: () => void;
  onAppend: () => void;
  onReplace: () => void;
}) {
  const preview = message.preview;
  if (!preview) return null;

  return (
    <section className="csv-preview" aria-label="CSV preview">
      <div className="csv-preview-header">
        <div>
          <span>CSV Preview</span>
          <strong>{preview.status === "valid" ? `${preview.rows.length} rows ready` : "Validation failed"}</strong>
        </div>
        {preview.status === "valid" ? (
          <div className="preview-actions">
            <button type="button" disabled={isSaving} onClick={onSaveNew}>
              Save as new plan
            </button>
            <button type="button" disabled={isSaving} onClick={onAppend}>
              Add to selected
            </button>
            <button className="danger-button" type="button" disabled={isSaving} onClick={onReplace}>
              Replace selected
            </button>
          </div>
        ) : null}
      </div>
      {preview.status === "invalid" ? (
        <ul className="preview-errors">
          {preview.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : (
        <div className="preview-table">
          {preview.rows.slice(0, 6).map((row, index) => (
            <div className="preview-row" key={`${row.date}-${row.item_name}-${index}`}>
              <strong>{row.date}</strong>
              <span>{row.item_name}</span>
              <small>{row.category}</small>
            </div>
          ))}
          {preview.rows.length > 6 ? <p>{preview.rows.length - 6} more rows not shown.</p> : null}
        </div>
      )}
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

function formatJobStatus(status: ChatJobSnapshot["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
