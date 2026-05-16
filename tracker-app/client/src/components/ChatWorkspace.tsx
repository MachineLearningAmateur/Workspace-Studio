import { useEffect, useState } from "react";
import { CodexChat } from "./CodexChat";
import { LearningSessions } from "./LearningSessions";
import type { ActivityRow, PlanSummary, WorkspaceCard, WorkspaceSummary } from "../types/tracker";

type ChatWorkspaceMode = "open_chat" | "guided_sessions";

interface ChatWorkspaceProps {
  plans: PlanSummary[];
  rows: ActivityRow[];
  cards: WorkspaceCard[];
  workspace: WorkspaceSummary;
  selectedPlanId: string;
  selectedWorkspaceId?: string;
  onPlanSaved: (plan: PlanSummary) => void;
  onRowsChanged: () => void;
  onCardsChanged: () => void;
  guidedLaunchRequest: GuidedLaunchRequest | null;
  onGuidedLaunchHandled: (token: string) => void;
}

export interface GuidedLaunchRequest {
  token: string;
  row?: ActivityRow;
  card?: WorkspaceCard;
}

const chatWorkspaceModeStorageKey = "careerprep-chat-workspace-mode";

export function ChatWorkspace({
  plans,
  rows,
  cards,
  workspace,
  selectedPlanId,
  selectedWorkspaceId,
  onPlanSaved,
  onRowsChanged,
  onCardsChanged,
  guidedLaunchRequest,
  onGuidedLaunchHandled
}: ChatWorkspaceProps) {
  const [mode, setMode] = useState<ChatWorkspaceMode>(() => getStoredMode());
  const hasGuidedSessionTargets = workspace.kind === "learning" && (rows.length > 0 || cards.length > 0);

  useEffect(() => {
    if (guidedLaunchRequest && mode !== "guided_sessions") {
      selectMode("guided_sessions");
    }
  }, [guidedLaunchRequest?.token, mode]);

  function selectMode(nextMode: ChatWorkspaceMode) {
    setMode(nextMode);
    window.localStorage.setItem(chatWorkspaceModeStorageKey, nextMode);
  }

  return (
    <section className="chat-workspace" aria-label="Chat workspace">
      <div className="chat-workspace-header">
        <div className="chat-mode-tabs" role="tablist" aria-label="Chat mode">
          <button
            className={mode === "open_chat" ? "active-mode" : ""}
            type="button"
            role="tab"
            aria-selected={mode === "open_chat"}
            onClick={() => selectMode("open_chat")}
          >
            Open Chat
          </button>
          <button
            className={mode === "guided_sessions" ? "active-mode" : ""}
            type="button"
            role="tab"
            aria-selected={mode === "guided_sessions"}
            onClick={() => selectMode("guided_sessions")}
          >
            Guided Sessions
          </button>
        </div>
      </div>

      {mode === "open_chat" ? (
        <CodexChat
          plans={plans}
          selectedPlanId={selectedPlanId}
          selectedWorkspaceId={selectedWorkspaceId}
          onPlanSaved={onPlanSaved}
        />
      ) : mode === "guided_sessions" ? (
        hasGuidedSessionTargets ? (
          <LearningSessions
            rows={rows}
            cards={cards}
            workspace={workspace}
            selectedPlanId={selectedPlanId}
            selectedWorkspaceId={selectedWorkspaceId}
            onRowsChanged={onRowsChanged}
            onCardsChanged={onCardsChanged}
            guidedLaunchRequest={guidedLaunchRequest}
            onGuidedLaunchHandled={onGuidedLaunchHandled}
          />
        ) : (
          <section className="empty-state" aria-live="polite">
            Guided Sessions are available here as a mode, but this workspace does not have any tracker tasks or board cards to build a session from yet.
          </section>
        )
      ) : null}
    </section>
  );
}

function getStoredMode(): ChatWorkspaceMode {
  const storedMode = window.localStorage.getItem(chatWorkspaceModeStorageKey);
  return storedMode === "guided_sessions" ? storedMode : "open_chat";
}
