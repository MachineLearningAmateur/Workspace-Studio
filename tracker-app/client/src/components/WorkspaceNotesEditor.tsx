import type { WorkspaceNotesSnapshot } from "../types/tracker";

interface WorkspaceNotesEditorProps {
  notes: WorkspaceNotesSnapshot | null;
  value: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function WorkspaceNotesEditor({ notes, value, isSaving, onChange, onSave }: WorkspaceNotesEditorProps) {
  return (
    <section className="workspace-notes-editor">
      <div className="section-heading">
        <div>
          <h2>Workspace Notes</h2>
          <p>Use Markdown for long-form context, study guides, links, and AI summaries.</p>
        </div>
        <button className="primary-button" type="button" disabled={isSaving} onClick={onSave}>
          {isSaving ? "Saving..." : "Save notes"}
        </button>
      </div>

      <label>
        Notes
        <textarea
          className="workspace-notes-textarea"
          rows={20}
          placeholder="# Notes&#10;&#10;Capture strategy, references, and summaries here."
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>

      {notes?.updated_at ? <p className="workspace-notes-meta">Updated {new Date(notes.updated_at).toLocaleString()}</p> : null}
    </section>
  );
}
