import { useState } from "react";
import type { NotebookCell, NotebookCellType, WorkspaceNotebook, WorkspaceNotebookSummary } from "../types/tracker";
import { MarkdownContent } from "./MarkdownContent";

const MARKDOWN_NOTE_TEMPLATE = `# Topic

## Goal
- What am I trying to learn?
- Why does it matter?

## Key Ideas
- Concept 1:
- Concept 2:
- Concept 3:

## Notes
Write the main explanation here.

> Important takeaway or reminder

## Example
\`\`\`python
# add example code here
\`\`\`

## Questions
- What is still unclear?
- What should I review next?

## Next Steps
- [ ] Practice one example
- [ ] Review weak spots
- [ ] Add follow-up notes
`;

interface WorkspaceNotebookEditorProps {
  notebooks: WorkspaceNotebookSummary[];
  selectedNotebookId: string;
  notebook: WorkspaceNotebook | null;
  isSaving: boolean;
  runningCellId: string | null;
  askingCellId: string | null;
  onChange: (notebook: WorkspaceNotebook) => void;
  onSave: () => void;
  onCreateNotebook: () => void;
  onSelectNotebook: (notebookId: string) => void;
  onRenameNotebook: () => void;
  onDeleteNotebook: () => void;
  onRunPython: (cellId: string) => void;
  onAskCodex: (cellId: string) => void;
}

export function WorkspaceNotebookEditor({
  notebooks,
  selectedNotebookId,
  notebook,
  isSaving,
  runningCellId,
  askingCellId,
  onChange,
  onSave,
  onCreateNotebook,
  onSelectNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onRunPython,
  onAskCodex
}: WorkspaceNotebookEditorProps) {
  if (!notebook) {
    return <p className="loading-state">Loading notebook...</p>;
  }

  const currentNotebook = notebook;
  const [collapsedMarkdownCellIds, setCollapsedMarkdownCellIds] = useState<string[]>([]);
  const [isNotebookLibraryCollapsed, setIsNotebookLibraryCollapsed] = useState(false);

  function updateCell(cellId: string, input: Partial<NotebookCell>) {
    onChange({
      ...currentNotebook,
      cells: currentNotebook.cells.map((cell) => (cell.id === cellId ? { ...cell, ...input } : cell))
    });
  }

  function addCell(type: NotebookCellType) {
    onChange({
      ...currentNotebook,
      cells: [
        ...currentNotebook.cells,
        {
          id: crypto.randomUUID(),
          type,
          source: type === "markdown" ? "" : type === "python" ? "print('hello')" : "Ask Codex something...",
          outputs: [],
          execution_status: "idle",
          updated_at: new Date().toISOString()
        }
      ]
    });
  }

  function removeCell(cellId: string) {
    onChange({
      ...currentNotebook,
      cells: currentNotebook.cells.filter((cell) => cell.id !== cellId)
    });
  }

  function moveCell(cellId: string, direction: -1 | 1) {
    const index = currentNotebook.cells.findIndex((cell) => cell.id === cellId);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= currentNotebook.cells.length) {
      return;
    }

    const nextCells = [...currentNotebook.cells];
    const [cell] = nextCells.splice(index, 1);
    nextCells.splice(targetIndex, 0, cell);
    onChange({
      ...currentNotebook,
      cells: nextCells
    });
  }

  function insertMarkdownTemplate(cell: NotebookCell) {
    const nextSource = cell.source.trim() ? `${cell.source.trimEnd()}\n\n${MARKDOWN_NOTE_TEMPLATE}` : MARKDOWN_NOTE_TEMPLATE;
    updateCell(cell.id, {
      source: nextSource,
      updated_at: new Date().toISOString()
    });
  }

  function toggleMarkdownEditor(cellId: string) {
    setCollapsedMarkdownCellIds((currentIds) =>
      currentIds.includes(cellId) ? currentIds.filter((id) => id !== cellId) : [...currentIds, cellId]
    );
  }

  return (
    <section className="workspace-notes-editor notebook-editor">
      <div className={`notebook-shell ${isNotebookLibraryCollapsed ? "notebook-shell-library-collapsed" : ""}`}>
        {!isNotebookLibraryCollapsed ? (
        <aside className="notebook-library">
          <div className="section-heading compact-heading">
            <div>
              <h2>Notebooks</h2>
              <p>Split workspace notes into smaller notebooks.</p>
            </div>
            <button type="button" onClick={onCreateNotebook}>
              New
            </button>
          </div>

          <div className="notebook-library-list">
            {notebooks.map((entry) => (
              <button
                key={entry.id}
                className={selectedNotebookId === entry.id ? "active-notebook-link" : ""}
                type="button"
                onClick={() => onSelectNotebook(entry.id)}
              >
                <strong>{entry.name}</strong>
                <small>{entry.updated_at ? `Updated ${new Date(entry.updated_at).toLocaleString()}` : "Not saved yet"}</small>
              </button>
            ))}
          </div>
        </aside>
        ) : null}

        <div className="notebook-main">
          <div className="section-heading">
            <div>
              <h2>{notebook.name}</h2>
              <p>Mix notes, Python cells, and inline Codex prompts in one notebook.</p>
            </div>
            <div className="inline-actions">
              <button className="ghost-button" type="button" onClick={() => setIsNotebookLibraryCollapsed((current) => !current)}>
                {isNotebookLibraryCollapsed ? "Show Notebooks" : "Hide Notebooks"}
              </button>
              <button className="ghost-button" type="button" onClick={onRenameNotebook}>
                Rename
              </button>
              <button className="ghost-button" type="button" onClick={onDeleteNotebook} disabled={notebooks.length <= 1}>
                Delete
              </button>
              <button className="primary-button" type="button" disabled={isSaving} onClick={onSave}>
                {isSaving ? "Saving..." : "Save notebook"}
              </button>
            </div>
          </div>

          <div className="notebook-toolbar">
            <button type="button" onClick={() => addCell("markdown")}>
              Add Markdown
            </button>
            <button type="button" onClick={() => addCell("python")}>
              Add Python
            </button>
            <button type="button" onClick={() => addCell("prompt")}>
              Add Prompt
            </button>
          </div>

          <div className="notebook-cell-list">
            {notebook.cells.map((cell, index) => {
          const isMarkdownEditorCollapsed = cell.type === "markdown" && collapsedMarkdownCellIds.includes(cell.id);

          return (
            <article className={`notebook-cell notebook-cell-${cell.type}`} key={cell.id}>
              <div className="notebook-cell-header">
                <div className="notebook-cell-meta">
                  <span className="notebook-cell-index">Cell {index + 1}</span>
                  <select value={cell.type} onChange={(event) => updateCell(cell.id, { type: event.target.value as NotebookCellType })}>
                    <option value="markdown">Markdown</option>
                    <option value="python">Python</option>
                    <option value="prompt">Prompt</option>
                  </select>
                </div>
                <div className="notebook-cell-actions">
                  <button type="button" onClick={() => moveCell(cell.id, -1)} disabled={index === 0}>
                    Up
                  </button>
                  <button type="button" onClick={() => moveCell(cell.id, 1)} disabled={index === currentNotebook.cells.length - 1}>
                    Down
                  </button>
                  {cell.type === "markdown" ? (
                    <button type="button" onClick={() => toggleMarkdownEditor(cell.id)}>
                      {isMarkdownEditorCollapsed ? "Show Editor" : "Hide Editor"}
                    </button>
                  ) : null}
                  <button className="danger-button" type="button" onClick={() => removeCell(cell.id)} disabled={currentNotebook.cells.length === 1}>
                    Delete
                  </button>
                </div>
              </div>

              {!isMarkdownEditorCollapsed ? (
                <textarea
                  className={`notebook-cell-editor notebook-editor-${cell.type}`}
                  rows={cell.type === "markdown" ? 8 : 10}
                  value={cell.source}
                  onChange={(event) => updateCell(cell.id, { source: event.target.value, updated_at: new Date().toISOString() })}
                />
              ) : null}

              {cell.type === "markdown" && cell.source.trim() ? (
                <div className="notebook-markdown-preview">
                  <MarkdownContent content={cell.source} />
                </div>
              ) : null}

              {cell.outputs.length ? (
                <div className="notebook-output-list">
                  {cell.outputs.map((output) => (
                    <section className={`notebook-output notebook-output-${output.kind}`} key={output.id}>
                      {output.kind === "codex" || output.kind === "stream" ? (
                        <MarkdownContent content={output.content} />
                      ) : (
                        <pre>{output.content}</pre>
                      )}
                    </section>
                  ))}
                </div>
              ) : null}

              <div className="notebook-cell-footer">
                <span className={`notebook-status notebook-status-${cell.execution_status}`}>{labelForStatus(cell.execution_status)}</span>
                <div className="notebook-cell-footer-actions">
                  {cell.type === "markdown" ? (
                    <button type="button" onClick={() => insertMarkdownTemplate(cell)}>
                      Insert Note Template
                    </button>
                  ) : null}
                  {cell.type === "python" ? (
                    <button className="primary-button" type="button" disabled={runningCellId === cell.id} onClick={() => onRunPython(cell.id)}>
                      {runningCellId === cell.id ? "Running..." : "Run Python"}
                    </button>
                  ) : null}
                  {cell.type === "prompt" ? (
                    <button className="primary-button" type="button" disabled={askingCellId === cell.id} onClick={() => onAskCodex(cell.id)}>
                      {askingCellId === cell.id ? "Asking..." : "Ask Codex"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
          </div>

          {notebook.updated_at ? <p className="workspace-notes-meta">Updated {new Date(notebook.updated_at).toLocaleString()}</p> : null}
        </div>
      </div>
    </section>
  );
}

function labelForStatus(status: NotebookCell["execution_status"]) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
