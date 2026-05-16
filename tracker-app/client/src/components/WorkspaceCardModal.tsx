import { useMemo } from "react";
import type { SubjectSummary, WorkspaceCard, WorkspaceSummary } from "../types/tracker";

export interface WorkspaceCardDraft {
  subject_id: string;
  title: string;
  status: string;
  problem_type: string;
  notes: string;
  tags: string;
}

interface WorkspaceCardModalProps {
  workspace: WorkspaceSummary | null;
  subjects: SubjectSummary[];
  card: WorkspaceCard | null;
  mode: "create" | "edit" | null;
  value: WorkspaceCardDraft;
  error: string | null;
  isSaving: boolean;
  onChange: (value: WorkspaceCardDraft) => void;
  onClose: () => void;
  onSave: () => void;
}

export function WorkspaceCardModal({
  workspace,
  subjects,
  card,
  mode,
  value,
  error,
  isSaving,
  onChange,
  onClose,
  onSave
}: WorkspaceCardModalProps) {
  const problemTypesBySubjectId = useMemo(
    () => ({
      leetcode: [
        "arrays_hashing",
        "two_pointers",
        "stack",
        "sliding_window",
        "binary_search",
        "linked_list",
        "trees",
        "trie",
        "heap",
        "intervals",
        "backtracking",
        "graphs",
        "dp_1d"
      ]
    }),
    []
  );
  const normalizedSubjectId = normalizeProblemTypeSubjectId(value.subject_id);
  const availableProblemTypes = problemTypesBySubjectId[normalizedSubjectId as keyof typeof problemTypesBySubjectId] ?? [];
  const title = useMemo(() => {
    if (!workspace || !mode) {
      return "";
    }

    return mode === "create"
      ? workspace.kind === "job_search"
        ? "Add Application Card"
        : "Add Learning Card"
      : "Edit Card";
  }, [mode, workspace]);

  if (!workspace || !mode) {
    return null;
  }

  function updateField(field: keyof WorkspaceCardDraft, nextValue: string) {
    if (field === "subject_id" && !problemTypesBySubjectId[normalizeProblemTypeSubjectId(nextValue) as keyof typeof problemTypesBySubjectId]) {
      onChange({
        ...value,
        subject_id: nextValue,
        problem_type: ""
      });
      return;
    }

    onChange({
      ...value,
      [field]: nextValue
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="workspace-card-modal-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{workspace.name}</p>
            <h2 id="workspace-card-modal-title">{title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label>
            Title
            <input type="text" required value={value.title} onChange={(event) => updateField("title", event.target.value)} />
          </label>

          <label>
            Subject
            <select value={value.subject_id} onChange={(event) => updateField("subject_id", event.target.value)}>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>

          {availableProblemTypes.length ? (
            <label>
              Problem Type
              <select value={value.problem_type} onChange={(event) => updateField("problem_type", event.target.value)}>
                <option value="">Choose a problem type</option>
                {availableProblemTypes.map((problemType) => (
                  <option key={problemType} value={problemType}>
                    {labelFor(problemType)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            Status
            <select value={value.status} onChange={(event) => updateField("status", event.target.value)}>
              {workspace.board_config.lanes.map((lane) => (
                <option key={lane.id} value={lane.id}>
                  {lane.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Tags
            <input
              type="text"
              placeholder="comma-separated tags"
              value={value.tags}
              onChange={(event) => updateField("tags", event.target.value)}
            />
          </label>

          <label>
            Notes
            <textarea rows={7} value={value.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </label>

          {card?.metadata && Object.keys(card.metadata).length ? (
            <section className="workspace-card-metadata">
              <h3>Details</h3>
              <dl>
                {Object.entries(card.metadata).map(([key, entryValue]) =>
                  entryValue ? (
                    <div key={key}>
                      <dt>{labelFor(key)}</dt>
                      <dd>{entryValue}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </section>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : mode === "create" ? "Create card" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function labelFor(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeProblemTypeSubjectId(subjectId: string) {
  return subjectId === "algorithms" || subjectId === "data-structures" ? "leetcode" : subjectId;
}
