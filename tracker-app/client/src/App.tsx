import { useEffect, useMemo, useRef, useState } from "react";
import {
  askCodexForWorkspaceNotebookCell,
  createWorkspaceNotebook,
  createJobApplication,
  createWorkspace,
  createWorkspaceCard,
  deleteWorkspaceCard,
  deleteWorkspace,
  deleteWorkspaceNotebook,
  deleteJobApplication,
  deletePlan,
  migratePlanToWorkspace,
  getActivityRows,
  getPlans,
  getWorkspaceCards,
  getWorkspaceNotebookById,
  getWorkspaceNotebook,
  getWorkspaceSubjects,
  getWorkspaces,
  renameWorkspaceNotebook,
  runWorkspaceNotebookPythonCell,
  updateJobApplication,
  saveWorkspaceNotebook,
  updateWorkspaceCard
} from "./api/trackerApi";
import { ChatWorkspace, type GuidedLaunchRequest } from "./components/ChatWorkspace";
import { JobApplicationModal } from "./components/JobApplicationModal";
import { PlanManager } from "./components/PlanManager";
import { ProfileManager } from "./components/ProfileManager";
import { WorkspaceBoard } from "./components/WorkspaceBoard";
import { WorkspaceCardModal, type WorkspaceCardDraft } from "./components/WorkspaceCardModal";
import { WorkspaceNotebookEditor } from "./components/WorkspaceNotebookEditor";
import type {
  ActivityRow,
  JobApplicationInput,
  JobApplicationRecord,
  WorkspaceNotebook,
  WorkspaceNotebookSummary,
  PlanSummary,
  SubjectSummary,
  WorkspaceCard,
  WorkspaceKind,
  WorkspaceSummary
} from "./types/tracker";
import { emptyJobApplicationInput } from "./types/tracker";

type ThemeMode = "dark" | "light";
type ShellSection = "workspace" | "plans" | "profile";
type WorkspaceTab = "board" | "assistant" | "notes";
type JobApplicationModalMode = "create" | "edit" | null;
type WorkspaceCardModalMode = "create" | "edit" | null;

function App() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [cards, setCards] = useState<WorkspaceCard[]>([]);
  const [legacyRows, setLegacyRows] = useState<ActivityRow[]>([]);
  const [notebookSummaries, setNotebookSummaries] = useState<WorkspaceNotebookSummary[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState("");
  const [notebook, setNotebook] = useState<WorkspaceNotebook | null>(null);
  const [runningNotebookCellId, setRunningNotebookCellId] = useState<string | null>(null);
  const [askingNotebookCellId, setAskingNotebookCellId] = useState<string | null>(null);
  const [shellSection, setShellSection] = useState<ShellSection>("workspace");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("board");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [jobApplicationDraft, setJobApplicationDraft] = useState<JobApplicationInput>(emptyJobApplicationInput);
  const [editingJobApplication, setEditingJobApplication] = useState<JobApplicationRecord | null>(null);
  const [jobApplicationModalMode, setJobApplicationModalMode] = useState<JobApplicationModalMode>(null);
  const [workspaceCardModalMode, setWorkspaceCardModalMode] = useState<WorkspaceCardModalMode>(null);
  const [editingCard, setEditingCard] = useState<WorkspaceCard | null>(null);
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
  const [workspaceCardDraft, setWorkspaceCardDraft] = useState<WorkspaceCardDraft>({
    subject_id: "",
    title: "",
    status: "not_started",
    problem_type: "",
    notes: "",
    tags: ""
  });
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("");
  const [newWorkspaceKind, setNewWorkspaceKind] = useState<WorkspaceKind>("learning");
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [guidedLaunchRequest, setGuidedLaunchRequest] = useState<GuidedLaunchRequest | null>(null);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const navMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const workspaceLoadRequestRef = useRef(0);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null,
    [selectedWorkspaceId, workspaces]
  );
  const selectedLegacyPlanId = selectedWorkspace?.source_type === "legacy_plan" ? selectedWorkspace.source_ref : "";
  const editingJobApplicationId = editingJobApplication?.id ?? "";

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("careerprep-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!isNavMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!navMenuRef.current?.contains(event.target as Node)) {
        setIsNavMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNavMenuOpen(false);
        navMenuButtonRef.current?.focus();
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNavMenuOpen]);

  useEffect(() => {
    if (!selectedWorkspace) {
      return;
    }

    if (selectedWorkspace.id !== selectedWorkspaceId) {
      setSelectedWorkspaceId(selectedWorkspace.id);
      return;
    }

    void loadWorkspaceData(selectedWorkspace);
  }, [selectedWorkspace?.id]);

  async function loadInitialState() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [nextPlans, nextWorkspaces] = await Promise.all([getPlans(), getWorkspaces()]);
      setPlans(nextPlans);
      setWorkspaces(nextWorkspaces);
      setSelectedWorkspaceId((current) => current || nextWorkspaces[0]?.id || "");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load app");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadWorkspaceData(workspace: WorkspaceSummary) {
    const requestId = workspaceLoadRequestRef.current + 1;
    workspaceLoadRequestRef.current = requestId;
    setWorkspaceError(null);
    setNotebookSummaries([]);
    setSelectedNotebookId("");
    setNotebook(null);

    try {
      const [nextSubjects, nextCards, nextNotes] = await Promise.all([
        getWorkspaceSubjects(workspace.id),
        getWorkspaceCards(workspace.id),
        getWorkspaceNotebook(workspace.id)
      ]);

      if (workspaceLoadRequestRef.current !== requestId) {
        return;
      }

      setSubjects(nextSubjects);
      setCards(nextCards);
      setNotebookSummaries(nextNotes);

      const preferredNotebookId = nextNotes.some((entry) => entry.id === selectedNotebookId) ? selectedNotebookId : nextNotes[0]?.id ?? "";
      const nextNotebook = preferredNotebookId ? await getWorkspaceNotebookById(workspace.id, preferredNotebookId) : null;

      if (workspaceLoadRequestRef.current !== requestId) {
        return;
      }

      setSelectedNotebookId(preferredNotebookId);
      setNotebook(nextNotebook);

      if (workspace.source_type === "legacy_plan") {
        const nextLegacyRows = await getActivityRows(workspace.source_ref);

        if (workspaceLoadRequestRef.current !== requestId) {
          return;
        }

        setLegacyRows(nextLegacyRows);
      } else {
        setLegacyRows([]);
      }
    } catch (error) {
      if (workspaceLoadRequestRef.current === requestId) {
        setWorkspaceError(error instanceof Error ? error.message : "Unable to load workspace");
      }
    }
  }

  async function refreshWorkspaces(preferredWorkspaceId?: string) {
    const nextWorkspaces = await getWorkspaces();
    setWorkspaces(nextWorkspaces);
    setSelectedWorkspaceId(preferredWorkspaceId ?? selectedWorkspaceId ?? nextWorkspaces[0]?.id ?? "");
  }

  async function refreshPlans() {
    setPlans(await getPlans());
  }

  async function createWorkspaceHandler() {
    if (!newWorkspaceName.trim()) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      const created = await createWorkspace({
        name: newWorkspaceName,
        description: newWorkspaceDescription,
        kind: newWorkspaceKind
      });
      setNewWorkspaceName("");
      setNewWorkspaceDescription("");
      setNewWorkspaceKind("learning");
      setIsCreateWorkspaceModalOpen(false);
      await refreshWorkspaces(created.id);
      setShellSection("workspace");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to create workspace");
    } finally {
      setIsSaving(false);
    }
  }

  function openCreateCard() {
    if (!selectedWorkspace) {
      return;
    }

    if (selectedWorkspace.kind === "job_search") {
      setJobApplicationModalMode("create");
      setEditingJobApplication(null);
      setJobApplicationDraft(emptyJobApplicationInput);
      return;
    }

    setWorkspaceCardModalMode("create");
    setEditingCard(null);
    setWorkspaceCardDraft(createEmptyCardDraft(selectedWorkspace, subjects));
  }

  function openEditCard(card: WorkspaceCard) {
    if (selectedWorkspace?.kind === "job_search") {
      const application = cardToJobApplication(card);
      setJobApplicationModalMode("edit");
      setEditingJobApplication(application);
      setJobApplicationDraft(stripJobApplicationMetadata(application));
      return;
    }

    setEditingCard(card);
    setWorkspaceCardModalMode("edit");
    setWorkspaceCardDraft({
      subject_id: card.subject_id,
      title: card.title,
      status: card.status,
      problem_type: card.metadata.problem_type ?? "",
      notes: card.notes,
      tags: card.tags.join(", ")
    });
  }

  async function saveWorkspaceCardHandler() {
    if (!selectedWorkspace) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      const payload = {
        subject_id: workspaceCardDraft.subject_id,
        title: workspaceCardDraft.title,
        status: workspaceCardDraft.status,
        metadata: buildCardMetadata(workspaceCardDraft.problem_type),
        notes: workspaceCardDraft.notes,
        tags: splitTags(workspaceCardDraft.tags)
      };

      const saved =
        workspaceCardModalMode === "edit" && editingCard
          ? await updateWorkspaceCard(selectedWorkspace.id, editingCard.id, payload)
          : await createWorkspaceCard(selectedWorkspace.id, payload);

      setCards((current) =>
        workspaceCardModalMode === "edit" && editingCard
          ? current.map((card) => (card.id === saved.id ? saved : card))
          : [saved, ...current]
      );
      closeWorkspaceCardModal();

      if (selectedWorkspace.source_type === "legacy_plan") {
        setLegacyRows(await getActivityRows(selectedWorkspace.source_ref));
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to save card");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveWorkspaceCard(card: WorkspaceCard, status: string) {
    if (!selectedWorkspace) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      const updated = await updateWorkspaceCard(selectedWorkspace.id, card.id, { status });
      setCards((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)));

      if (selectedWorkspace.source_type === "legacy_plan") {
        setLegacyRows(await getActivityRows(selectedWorkspace.source_ref));
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to move card");
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshCurrentWorkspaceCards() {
    if (!selectedWorkspace) {
      return;
    }

    setCards(await getWorkspaceCards(selectedWorkspace.id));

    if (selectedWorkspace.source_type === "legacy_plan") {
      setLegacyRows(await getActivityRows(selectedWorkspace.source_ref));
    }
  }

  async function startGuidedSessionFromCard(card: WorkspaceCard) {
    if (!selectedWorkspace) {
      return;
    }

    setWorkspaceError(null);
    setIsSaving(true);

    try {
      let nextCard = card;

      if (card.status !== "in_progress") {
        nextCard = await updateWorkspaceCard(selectedWorkspace.id, card.id, { status: "in_progress" });
        setCards((current) => current.map((candidate) => (candidate.id === nextCard.id ? nextCard : candidate)));

        if (selectedWorkspace.source_type === "legacy_plan") {
          setLegacyRows(await getActivityRows(selectedWorkspace.source_ref));
        }
      }

      setWorkspaceTab("assistant");
      setGuidedLaunchRequest({
        token: `${nextCard.id}-${Date.now()}`,
        card: nextCard
      });
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to start guided session");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveWorkspaceNotebookHandler(nextNotebook = notebook) {
    if (!selectedWorkspace || !nextNotebook) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      const saved = await saveWorkspaceNotebook(selectedWorkspace.id, nextNotebook.id, {
        cells: nextNotebook.cells
      });
      setNotebook(saved);
      await refreshNotebookSummaries(selectedWorkspace.id, saved.id);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to save notebook");
    } finally {
      setIsSaving(false);
    }
  }

  async function runNotebookPythonCellHandler(cellId: string) {
    if (!selectedWorkspace || !notebook) {
      return;
    }

    setRunningNotebookCellId(cellId);
    setWorkspaceError(null);

    try {
      const saved = await saveWorkspaceNotebook(selectedWorkspace.id, notebook.id, { cells: notebook.cells });
      setNotebook(saved);
      const executed = await runWorkspaceNotebookPythonCell(selectedWorkspace.id, notebook.id, cellId);
      setNotebook(executed);
      await refreshNotebookSummaries(selectedWorkspace.id, executed.id);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to run Python cell");
    } finally {
      setRunningNotebookCellId(null);
    }
  }

  async function askCodexForNotebookCellHandler(cellId: string) {
    if (!selectedWorkspace || !notebook) {
      return;
    }

    setAskingNotebookCellId(cellId);
    setWorkspaceError(null);

    try {
      const saved = await saveWorkspaceNotebook(selectedWorkspace.id, notebook.id, { cells: notebook.cells });
      setNotebook(saved);
      const executed = await askCodexForWorkspaceNotebookCell(selectedWorkspace.id, notebook.id, cellId);
      setNotebook(executed);
      await refreshNotebookSummaries(selectedWorkspace.id, executed.id);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to ask Codex from notebook cell");
    } finally {
      setAskingNotebookCellId(null);
    }
  }

  async function refreshNotebookSummaries(workspaceId: string, preferredNotebookId?: string) {
    const nextSummaries = await getWorkspaceNotebook(workspaceId);
    setNotebookSummaries(nextSummaries);
    if (preferredNotebookId) {
      setSelectedNotebookId(preferredNotebookId);
    } else if (!nextSummaries.some((entry) => entry.id === selectedNotebookId)) {
      setSelectedNotebookId(nextSummaries[0]?.id ?? "");
    }
  }

  async function selectNotebook(notebookId: string) {
    if (!selectedWorkspace) {
      return;
    }

    if (notebookId === selectedNotebookId) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      if (notebook) {
        await saveWorkspaceNotebook(selectedWorkspace.id, notebook.id, {
          cells: notebook.cells
        });
      }

      const [nextNotebook, nextSummaries] = await Promise.all([
        getWorkspaceNotebookById(selectedWorkspace.id, notebookId),
        getWorkspaceNotebook(selectedWorkspace.id)
      ]);
      setSelectedNotebookId(notebookId);
      setNotebookSummaries(nextSummaries);
      setNotebook(nextNotebook);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to load notebook");
    } finally {
      setIsSaving(false);
    }
  }

  async function createNotebookHandler() {
    if (!selectedWorkspace) {
      return;
    }

    const name = window.prompt("New notebook name", "New Notebook");
    if (!name?.trim()) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      const created = await createWorkspaceNotebook(selectedWorkspace.id, { name: name.trim() });
      await refreshNotebookSummaries(selectedWorkspace.id, created.id);
      setNotebook(created);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to create notebook");
    } finally {
      setIsSaving(false);
    }
  }

  async function renameNotebookHandler() {
    if (!selectedWorkspace || !notebook) {
      return;
    }

    const name = window.prompt("Rename notebook", notebook.name);
    if (!name?.trim() || name.trim() === notebook.name) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      const renamed = await renameWorkspaceNotebook(selectedWorkspace.id, notebook.id, { name: name.trim() });
      setNotebook(renamed);
      await refreshNotebookSummaries(selectedWorkspace.id, renamed.id);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to rename notebook");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteNotebookHandler() {
    if (!selectedWorkspace || !notebook) {
      return;
    }

    if (!window.confirm(`Delete notebook "${notebook.name}"?`)) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      const nextNotebook = await deleteWorkspaceNotebook(selectedWorkspace.id, notebook.id);
      await refreshNotebookSummaries(selectedWorkspace.id, nextNotebook.id);
      setNotebook(await getWorkspaceNotebookById(selectedWorkspace.id, nextNotebook.id));
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to delete notebook");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveJobApplicationHandler() {
    if (!selectedWorkspace) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      if (selectedWorkspace.source_type === "job_applications") {
        if (jobApplicationModalMode === "edit" && editingJobApplication) {
          await updateJobApplication(editingJobApplication.id, jobApplicationDraft);
        } else {
          await createJobApplication(jobApplicationDraft);
        }
      } else {
        const payload = buildJobApplicationCardPayload(jobApplicationDraft);
        if (jobApplicationModalMode === "edit" && editingJobApplication) {
          await updateWorkspaceCard(selectedWorkspace.id, editingJobApplication.id, payload);
        } else {
          await createWorkspaceCard(selectedWorkspace.id, payload);
        }
      }

      closeJobApplicationModal();
      setCards(await getWorkspaceCards(selectedWorkspace.id));
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to save application");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeJobApplicationHandler() {
    if (!editingJobApplication || !selectedWorkspace) {
      return;
    }

    if (!window.confirm(`Delete application for "${editingJobApplication.company} - ${editingJobApplication.role}"?`)) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);

    try {
      if (selectedWorkspace.source_type === "job_applications") {
        await deleteJobApplication(editingJobApplication.id);
      } else {
        await deleteWorkspaceCard(selectedWorkspace.id, editingJobApplication.id);
      }
      closeJobApplicationModal();
      setCards(await getWorkspaceCards(selectedWorkspace.id));
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to delete application");
    } finally {
      setIsSaving(false);
    }
  }

  async function removePlanHandler(planId: string) {
    setPlanError(null);

    try {
      await deletePlan(planId);
      await refreshPlans();
      await refreshWorkspaces();
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Unable to delete plan");
    }
  }

  async function handlePlanSaved(plan: PlanSummary) {
    await Promise.all([refreshPlans(), refreshWorkspaces(`plan-${plan.id}`)]);
  }

  async function migrateLegacyPlanWorkspaceHandler() {
    if (!selectedWorkspace || selectedWorkspace.source_type !== "legacy_plan") {
      return;
    }

    const confirmed = window.confirm(
      `Migrate "${selectedWorkspace.name}" from the legacy CSV plan into a managed workspace? This will delete the old plan after the migration completes.`
    );
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);
    workspaceLoadRequestRef.current += 1;

    try {
      const migration = await migratePlanToWorkspace(selectedWorkspace.source_ref);
      setSubjects([]);
      setCards([]);
      setLegacyRows([]);
      setNotebookSummaries([]);
      setSelectedNotebookId("");
      setNotebook(null);
      setShellSection("workspace");
      setWorkspaceTab("board");
      await Promise.all([refreshPlans(), refreshWorkspaces(migration.workspace.id)]);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to migrate workspace");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeWorkspaceHandler() {
    if (!selectedWorkspace || !canDeleteWorkspace(selectedWorkspace)) {
      return;
    }

    const confirmed = window.confirm(
      `Delete workspace "${selectedWorkspace.name}"? This will remove its cards, notes, and notebooks.`
    );
    if (!confirmed) {
      return;
    }

    const confirmationName = window.prompt(
      `Type the workspace name to confirm deletion:\n\n${selectedWorkspace.name}`,
      ""
    );
    if (confirmationName !== selectedWorkspace.name) {
      return;
    }

    setIsSaving(true);
    setWorkspaceError(null);
    workspaceLoadRequestRef.current += 1;

    try {
      await deleteWorkspace(selectedWorkspace.id);
      const nextWorkspaces = await getWorkspaces();
      setWorkspaces(nextWorkspaces);
      setSelectedWorkspaceId(nextWorkspaces[0]?.id ?? "");
      setSubjects([]);
      setCards([]);
      setLegacyRows([]);
      setNotebookSummaries([]);
      setSelectedNotebookId("");
      setNotebook(null);
      setShellSection("workspace");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to delete workspace");
    } finally {
      setIsSaving(false);
    }
  }

  function closeWorkspaceCardModal() {
    setWorkspaceCardModalMode(null);
    setEditingCard(null);
    setWorkspaceCardDraft(createEmptyCardDraft(selectedWorkspace, subjects));
  }

  function closeJobApplicationModal() {
    setJobApplicationModalMode(null);
    setEditingJobApplication(null);
    setJobApplicationDraft(emptyJobApplicationInput);
  }

  function selectShellSection(section: ShellSection) {
    setShellSection(section);
    setIsNavMenuOpen(false);
  }

  function openCreateWorkspaceModal() {
    setIsNavMenuOpen(false);
    setWorkspaceError(null);
    setNewWorkspaceName("");
    setNewWorkspaceDescription("");
    setNewWorkspaceKind("learning");
    setIsCreateWorkspaceModalOpen(true);
  }

  function selectWorkspace(workspaceId: string) {
    if (workspaceId === selectedWorkspaceId) {
      setIsNavMenuOpen(false);
      return;
    }

    workspaceLoadRequestRef.current += 1;
    setShellSection("workspace");
    setNotebookSummaries([]);
    setSelectedNotebookId("");
    setNotebook(null);
    setSelectedWorkspaceId(workspaceId);
    setIsNavMenuOpen(false);
  }

  return (
    <main className="workspace-main">
      <header className="app-header workspace-header">
        <div className="workspace-header-main">
          <div className="workspace-nav-menu" ref={navMenuRef}>
            <button
              ref={navMenuButtonRef}
              className={`workspace-hamburger ${isNavMenuOpen ? "workspace-hamburger-open" : ""}`}
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={isNavMenuOpen}
              aria-controls="workspace-nav-dropdown"
              onClick={() => setIsNavMenuOpen((current) => !current)}
            >
              <span />
              <span />
              <span />
            </button>

            {isNavMenuOpen ? (
              <div className="workspace-nav-dropdown" id="workspace-nav-dropdown" role="menu" aria-label="Workspace navigation">
                <div className="workspace-nav-group">
                  <span className="workspace-sidebar-label">Navigate</span>
                  <button
                    className={shellSection === "workspace" ? "active-workspace-link" : ""}
                    type="button"
                    onClick={() => selectShellSection("workspace")}
                  >
                    Workspaces
                  </button>
                  <button
                    className={shellSection === "plans" ? "active-workspace-link" : ""}
                    type="button"
                    onClick={() => selectShellSection("plans")}
                  >
                    Plans
                  </button>
                  <button
                    className={shellSection === "profile" ? "active-workspace-link" : ""}
                    type="button"
                    onClick={() => selectShellSection("profile")}
                  >
                    Profile
                  </button>
                  <button type="button" onClick={openCreateWorkspaceModal}>
                    New Workspace
                  </button>
                </div>

                <div className="workspace-nav-group">
                  <span className="workspace-sidebar-label">Workspaces</span>
                  <div className="workspace-nav-workspace-list">
                    {workspaces.map((workspace) => (
                      <button
                        key={workspace.id}
                        className={selectedWorkspace?.id === workspace.id ? "active-workspace-link" : ""}
                        type="button"
                        onClick={() => selectWorkspace(workspace.id)}
                      >
                        <strong>{workspace.name}</strong>
                        <small>{workspace.kind === "job_search" ? "Job search board" : workspace.source_type.replace(/_/g, " ")}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <h1 className="workspace-title">Learn with AI</h1>
        </div>
        <div className="header-controls">
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
            onClick={() => setThemeMode((current) => (current === "dark" ? "light" : "dark"))}
          >
            {themeMode === "dark" ? (
              <>
                <span className="theme-icon active-icon" aria-hidden="true">
                  <MoonIcon />
                </span>
                <span className="theme-toggle-knob" aria-hidden="true" />
              </>
            ) : (
              <>
                <span className="theme-toggle-knob" aria-hidden="true" />
                <span className="theme-icon active-icon" aria-hidden="true">
                  <SunIcon />
                </span>
              </>
            )}
          </button>
        </div>
      </header>

      {loadError ? (
        <section className="alert" role="alert">
          {loadError}
        </section>
      ) : null}

      {isLoading ? (
        <p className="loading-state">Loading workspace app...</p>
      ) : (
        <div className="workspace-layout">
          <section className="workspace-content">
            {workspaceError ? (
              <section className="alert" role="alert">
                {workspaceError}
              </section>
            ) : null}

            {shellSection === "plans" ? (
              <PlanManager plans={plans} deletingPlanId={null} error={planError} onDeletePlan={(planId) => void removePlanHandler(planId)} />
            ) : shellSection === "profile" ? (
              <ProfileManager />
            ) : selectedWorkspace ? (
              <>
                <section className="selected-plan-summary workspace-summary">
                  <div>
                    <span>Active workspace</span>
                    <strong>{selectedWorkspace.name}</strong>
                  </div>
                  <div className="inline-actions">
                    <p>{selectedWorkspace.description || "Use the board to plan, track, and revisit what matters."}</p>
                    {canMigrateWorkspace(selectedWorkspace) ? (
                      <button className="ghost-button" type="button" disabled={isSaving} onClick={() => void migrateLegacyPlanWorkspaceHandler()}>
                        Migrate to Workspace
                      </button>
                    ) : null}
                    {canDeleteWorkspace(selectedWorkspace) ? (
                      <button className="ghost-button danger-button" type="button" disabled={isSaving} onClick={() => void removeWorkspaceHandler()}>
                        Delete Workspace
                      </button>
                    ) : null}
                  </div>
                </section>

                <nav className="tab-bar" aria-label="Workspace sections">
                  <button className={workspaceTab === "board" ? "active-tab" : ""} type="button" onClick={() => setWorkspaceTab("board")}>
                    Board
                  </button>
                  <button
                    className={workspaceTab === "assistant" ? "active-tab" : ""}
                    type="button"
                    onClick={() => setWorkspaceTab("assistant")}
                  >
                    Assistant
                  </button>
                  <button className={workspaceTab === "notes" ? "active-tab" : ""} type="button" onClick={() => setWorkspaceTab("notes")}>
                    Notes
                  </button>
                </nav>

                {workspaceTab === "board" ? (
                  <WorkspaceBoard
                    workspace={selectedWorkspace}
                    subjects={subjects}
                    cards={cards}
                    isSaving={isSaving}
                    onAddCard={openCreateCard}
                    onEditCard={openEditCard}
                    onMoveCard={(card, status) => void moveWorkspaceCard(card, status)}
                    onStartGuidedSession={(card) => void startGuidedSessionFromCard(card)}
                  />
                ) : null}

                {workspaceTab === "assistant" ? (
                  <ChatWorkspace
                    plans={plans}
                    rows={selectedWorkspace.source_type === "legacy_plan" ? legacyRows : []}
                    cards={cards}
                    workspace={selectedWorkspace}
                    selectedPlanId={selectedLegacyPlanId}
                    selectedWorkspaceId={selectedWorkspace.id}
                    onPlanSaved={(plan) => void handlePlanSaved(plan)}
                    onRowsChanged={() => void loadWorkspaceData(selectedWorkspace)}
                    onCardsChanged={() => void refreshCurrentWorkspaceCards()}
                    guidedLaunchRequest={guidedLaunchRequest}
                    onGuidedLaunchHandled={(token) =>
                      setGuidedLaunchRequest((current) => (current?.token === token ? null : current))
                    }
                  />
                ) : null}

                {workspaceTab === "notes" ? (
                  <WorkspaceNotebookEditor
                    notebooks={notebookSummaries}
                    selectedNotebookId={selectedNotebookId}
                    notebook={notebook}
                    isSaving={isSaving}
                    runningCellId={runningNotebookCellId}
                    askingCellId={askingNotebookCellId}
                    onChange={setNotebook}
                    onSave={() => void saveWorkspaceNotebookHandler()}
                    onCreateNotebook={() => void createNotebookHandler()}
                    onSelectNotebook={(notebookId) => void selectNotebook(notebookId)}
                    onRenameNotebook={() => void renameNotebookHandler()}
                    onDeleteNotebook={() => void deleteNotebookHandler()}
                    onRunPython={(cellId) => void runNotebookPythonCellHandler(cellId)}
                    onAskCodex={(cellId) => void askCodexForNotebookCellHandler(cellId)}
                  />
                ) : null}
              </>
            ) : (
              <p className="empty-state">No workspace available yet.</p>
            )}
          </section>
        </div>
      )}

      <WorkspaceCardModal
        workspace={selectedWorkspace}
        subjects={subjects}
        card={editingCard}
        mode={workspaceCardModalMode}
        value={workspaceCardDraft}
        error={workspaceError}
        isSaving={isSaving}
        onChange={setWorkspaceCardDraft}
        onClose={closeWorkspaceCardModal}
        onSave={() => void saveWorkspaceCardHandler()}
      />

      <JobApplicationModal
        mode={jobApplicationModalMode === "create" ? "create" : "edit"}
        application={jobApplicationModalMode === "create" ? createDraftJobApplication(jobApplicationDraft) : editingJobApplication}
        value={jobApplicationDraft}
        isSaving={isSaving}
        isDeleting={isSaving && editingJobApplicationId === editingJobApplication?.id}
        error={workspaceError}
        onChange={setJobApplicationDraft}
        onClose={closeJobApplicationModal}
        onSave={() => void saveJobApplicationHandler()}
        onDelete={() => void removeJobApplicationHandler()}
      />

      {isCreateWorkspaceModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-workspace-modal-title">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Workspace</p>
                <h2 id="create-workspace-modal-title">Create New Workspace</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setIsCreateWorkspaceModalOpen(false)}>
                Close
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void createWorkspaceHandler();
              }}
            >
              <label>
                Name
                <input autoFocus value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} />
              </label>
              <label>
                Workspace type
                <select value={newWorkspaceKind} onChange={(event) => setNewWorkspaceKind(event.target.value as WorkspaceKind)}>
                  <option value="learning">Learning</option>
                  <option value="job_search">Job tracking</option>
                </select>
              </label>
              <label>
                Description
                <textarea rows={4} value={newWorkspaceDescription} onChange={(event) => setNewWorkspaceDescription(event.target.value)} />
              </label>
              {workspaceError ? <p className="form-error">{workspaceError}</p> : null}
              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={() => setIsCreateWorkspaceModalOpen(false)}>
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function createEmptyCardDraft(workspace: WorkspaceSummary | null, subjects: SubjectSummary[]): WorkspaceCardDraft {
  return {
    subject_id: subjects[0]?.id ?? "general",
    title: "",
    status: workspace?.board_config.lanes[0]?.id ?? "not_started",
    problem_type: "",
    notes: "",
    tags: ""
  };
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function buildCardMetadata(problemType: string): Record<string, string> {
  return problemType ? { problem_type: problemType } : {};
}

function canDeleteWorkspace(workspace: WorkspaceSummary | null) {
  return workspace?.source_type === "generic_learning" || workspace?.source_type === "generic_job_search";
}

function canMigrateWorkspace(workspace: WorkspaceSummary | null) {
  return workspace?.source_type === "legacy_plan";
}

function buildJobApplicationCardPayload(input: JobApplicationInput) {
  const company = String(input.company ?? "").trim();
  const role = String(input.role ?? "").trim();

  return {
    subject_id: "applications",
    title: [company, role].filter(Boolean).join(" - "),
    status: String(input.status ?? "applied"),
    notes: String(input.notes ?? ""),
    tags: [],
    metadata: {
      company,
      role,
      date_applied: String(input.date_applied ?? ""),
      job_url: String(input.job_url ?? ""),
      location: String(input.location ?? ""),
      next_follow_up_date: String(input.next_follow_up_date ?? "")
    }
  };
}

function stripJobApplicationMetadata(application: JobApplicationRecord): JobApplicationInput {
  const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...input } = application;
  return input;
}

function cardToJobApplication(card: WorkspaceCard): JobApplicationRecord {
  return {
    id: card.id,
    company: card.metadata.company ?? card.title.split(" - ")[0] ?? "",
    role: card.metadata.role ?? card.title.split(" - ").slice(1).join(" - ") ?? "",
    status: (card.status as JobApplicationRecord["status"]) ?? "applied",
    date_applied: card.metadata.date_applied ?? "",
    job_url: card.metadata.job_url ?? "",
    location: card.metadata.location ?? "",
    next_follow_up_date: card.metadata.next_follow_up_date ?? "",
    notes: card.notes,
    created_at: card.created_at,
    updated_at: card.updated_at
  };
}

function createDraftJobApplication(input: JobApplicationInput): JobApplicationRecord {
  return {
    id: "draft",
    created_at: "",
    updated_at: "",
    ...input
  };
}

function getInitialThemeMode(): ThemeMode {
  return window.localStorage.getItem("careerprep-theme") === "light" ? "light" : "dark";
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M20.2 15.4A8.2 8.2 0 0 1 8.6 3.8 8.7 8.7 0 1 0 20.2 15.4Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  );
}

export default App;
