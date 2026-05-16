import { useMemo, useState } from "react";
import type { SubjectSummary, WorkspaceCard, WorkspaceSummary } from "../types/tracker";

interface WorkspaceBoardProps {
  workspace: WorkspaceSummary;
  subjects: SubjectSummary[];
  cards: WorkspaceCard[];
  isSaving: boolean;
  onAddCard: () => void;
  onEditCard: (card: WorkspaceCard) => void;
  onMoveCard: (card: WorkspaceCard, status: string) => void;
  onStartGuidedSession?: (card: WorkspaceCard) => void;
}

export function WorkspaceBoard({
  workspace,
  subjects,
  cards,
  isSaving,
  onAddCard,
  onEditCard,
  onMoveCard,
  onStartGuidedSession
}: WorkspaceBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [expandedNotesCardIds, setExpandedNotesCardIds] = useState<string[]>([]);

  const filteredCards = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return cards.filter((card) => {
      const matchesSubject = subjectFilter === "all" ? true : card.subject_id === subjectFilter;
      const matchesSearch = normalizedSearch
        ? `${card.title} ${card.notes} ${card.tags.join(" ")} ${Object.values(card.metadata).join(" ")}`
            .toLowerCase()
            .includes(normalizedSearch)
        : true;

      return matchesSubject && matchesSearch;
    });
  }, [cards, searchText, subjectFilter]);

  const columns = useMemo(
    () =>
      workspace.board_config.lanes.map((lane) => ({
        ...lane,
        cards: filteredCards.filter((card) => card.status === lane.id)
      })),
    [filteredCards, workspace.board_config.lanes]
  );

  return (
    <section className="workspace-board-shell" aria-label={`${workspace.name} board`}>
      <div className="section-heading">
        <div>
          <h2>{workspace.name}</h2>
          <p>{workspace.description || "Drag cards across stages to keep the learning flow moving."}</p>
        </div>
        <button className="primary-button" type="button" onClick={onAddCard}>
          {workspace.kind === "job_search" ? "Add application" : "Add card"}
        </button>
      </div>

      <div className="workspace-board-toolbar">
        <label>
          Search
          <input
            type="search"
            placeholder="Search title, notes, tags"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
        <label>
          Subject
          <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
            <option value="all">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="workspace-board">
        {columns.map((column) => (
          <section
            key={column.id}
            className={`workspace-column ${draggedId ? "workspace-column-ready" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const card = cards.find((candidate) => candidate.id === draggedId);
              setDraggedId(null);

              if (card && card.status !== column.id) {
                onMoveCard(card, column.id);
              }
            }}
          >
            <header className="workspace-column-header">
              <div>
                <span>{column.label}</span>
                <strong>{column.cards.length}</strong>
              </div>
            </header>

            <div className="workspace-card-stack">
              {column.cards.length === 0 ? <p className="workspace-column-empty">No cards</p> : null}
              {column.cards.map((card) => (
                <article
                  key={card.id}
                  className={`workspace-card ${isSaving ? "workspace-card-disabled" : ""}`}
                  draggable={!isSaving}
                  onDragStart={() => setDraggedId(card.id)}
                  onDragEnd={() => setDraggedId(null)}
                  onClick={() => onEditCard(card)}
                >
                  <div className="workspace-card-topline">
                    <span className="workspace-card-subject">{subjectNameFor(card.subject_id, subjects)}</span>
                    <span className="workspace-card-source">{card.source}</span>
                  </div>
                  <h3>{card.title}</h3>
                  <details
                    className="workspace-card-notes"
                    open={expandedNotesCardIds.includes(card.id)}
                    onClick={(event) => event.stopPropagation()}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setExpandedNotesCardIds((current) =>
                        isOpen ? Array.from(new Set([...current, card.id])) : current.filter((id) => id !== card.id)
                      );
                    }}
                  >
                    <summary>Notes</summary>
                    <p>{card.notes || "No notes yet."}</p>
                  </details>
                  {card.metadata.problem_type || card.tags.length ? (
                    <div className="workspace-card-tags">
                      {card.metadata.problem_type ? <span>{subjectTagLabel(card.metadata.problem_type)}</span> : null}
                      {card.tags.slice(0, 3).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                  {workspace.kind === "learning" && onStartGuidedSession ? (
                    <div className="workspace-card-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onStartGuidedSession(card);
                        }}
                      >
                        Guided Session
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function subjectNameFor(subjectId: string, subjects: SubjectSummary[]) {
  return subjects.find((subject) => subject.id === subjectId)?.name ?? "General";
}

function subjectTagLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
