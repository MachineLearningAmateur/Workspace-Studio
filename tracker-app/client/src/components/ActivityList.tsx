import type { ActivityRow } from "../types/tracker";
import { labelFor } from "../types/tracker";
import { StatusBadge } from "./StatusBadge";

interface ActivityListProps {
  deletingRowIndex: number | null;
  onDelete: (row: ActivityRow) => void;
  rows: ActivityRow[];
  onEdit: (row: ActivityRow) => void;
  onStartGuidedSession: (row: ActivityRow) => void;
}

export function ActivityList({ rows, deletingRowIndex, onDelete, onEdit, onStartGuidedSession }: ActivityListProps) {
  const groups = groupByDate(rows);

  if (rows.length === 0) {
    return <p className="empty-state">No activity rows match the current filters.</p>;
  }

  return (
    <section className="activity-list" aria-label="Activity list">
      {groups.map((group) => (
        <div className="date-group" key={group.date}>
          <div className="date-heading">
            <h2>{group.date}</h2>
            <span>{group.rows.length} activities</span>
          </div>

          <div className="activity-stack">
            {group.rows.map((row) => (
              <article className="activity-card" key={row.row_index}>
                <div className="activity-card-header">
                  <div>
                    <div className="activity-title-row">
                      <StatusBadge status={row.status} />
                      <h3>{row.item_name}</h3>
                    </div>
                    <p className="activity-subtitle">
                      {labelFor(row.category)} / {labelFor(row.item_type)}
                      {row.difficulty ? ` / ${labelFor(row.difficulty)}` : ""}
                    </p>
                  </div>
                  <div className="activity-card-actions">
                    <details className="activity-actions-menu">
                      <summary>
                        <span>Actions</span>
                        <span aria-hidden="true">{`\u25BE`}</span>
                      </summary>
                      <div className="activity-actions-dropdown">
                        <button className="ghost-button" type="button" onClick={() => onStartGuidedSession(row)}>
                          Guided Session
                        </button>
                        <button type="button" onClick={() => onEdit(row)}>
                          Edit
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          disabled={!isCustomRow(row) || deletingRowIndex === row.row_index}
                          title={!isCustomRow(row) ? 'Only rows with source "custom" can be deleted.' : undefined}
                          onClick={() => onDelete(row)}
                        >
                          {deletingRowIndex === row.row_index ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </details>
                  </div>
                </div>

                <dl className="activity-details">
                  <Detail label="Time" value={row.time_spent_min ? `${row.time_spent_min} min` : ""} />
                  <Detail label="Confidence" value={row.confidence ? `${row.confidence}/5` : ""} />
                  <Detail label="Attempt" value={labelFor(row.attempt_type)} />
                  <Detail label="Result" value={labelFor(row.result)} />
                  <Detail label="Pattern" value={row.pattern} />
                  <Detail label="Relevance" value={labelFor(row.interview_relevance)} />
                  <Detail label="Scheduled" value={formatTrackerDateTime(row.scheduled_date)} />
                  <Detail label="Completed" value={formatTrackerDateTime(row.completed_at)} />
                  <Detail label="Source" value={row.source} />
                  <Detail label="CSV row" value={String(row.row_index + 1)} />
                </dl>

                <div className="activity-notes">
                  <span>Notes</span>
                  <p>{row.notes || "No notes"}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function isCustomRow(row: ActivityRow) {
  return row.source === "custom";
}

function formatTrackerDateTime(value: string) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second = "0"] = timePart.split(":");
    return new Date(year, month - 1, day, Number(hour), Number(minute), Number(second)).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return value;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function groupByDate(rows: ActivityRow[]) {
  const groups = new Map<string, ActivityRow[]>();

  for (const row of rows) {
    const group = groups.get(row.date) ?? [];
    group.push(row);
    groups.set(row.date, group);
  }

  return Array.from(groups.entries()).map(([date, groupRows]) => ({
    date,
    rows: groupRows
  }));
}
