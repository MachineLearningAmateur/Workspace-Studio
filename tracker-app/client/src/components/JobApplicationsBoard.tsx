import { useMemo, useState } from "react";
import { JobApplicationStatusBadge } from "./JobApplicationStatusBadge";
import { jobApplicationStatuses, labelFor } from "../types/tracker";
import type { JobApplicationInput, JobApplicationRecord, JobApplicationStatus } from "../types/tracker";

interface JobApplicationsBoardProps {
  applications: JobApplicationRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onAdd: () => void;
  onEdit: (application: JobApplicationRecord) => void;
  onRefresh: () => void;
  onMove: (application: JobApplicationRecord, status: JobApplicationStatus) => void;
}

const closedStatuses = new Set<JobApplicationStatus>(["rejected", "withdrawn", "ghosted"]);
type FollowUpFilter = "all" | "due_or_overdue" | "overdue";

export function JobApplicationsBoard({
  applications,
  isLoading,
  isSaving,
  error,
  onAdd,
  onEdit,
  onRefresh,
  onMove
}: JobApplicationsBoardProps) {
  const [searchText, setSearchText] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const today = getTodayDate();

  const filteredApplications = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return applications.filter((application) => {
      if (!showClosed && closedStatuses.has(application.status)) {
        return false;
      }

      if (followUpFilter === "due_or_overdue" && !isDueOrOverdue(application.next_follow_up_date, today)) {
        return false;
      }

      if (followUpFilter === "overdue" && !isOverdue(application.next_follow_up_date, today)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return `${application.company} ${application.role} ${application.location} ${application.notes}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [applications, followUpFilter, searchText, showClosed, today]);

  const boardColumns = useMemo(
    () =>
      jobApplicationStatuses
        .filter((status) => showClosed || !closedStatuses.has(status))
        .map((status) => ({
          status,
          applications: filteredApplications.filter((application) => application.status === status).sort(compareApplications)
        })),
    [filteredApplications, showClosed]
  );

  const summary = useMemo(() => {
    const activeApplications = applications.filter((application) => !closedStatuses.has(application.status)).length;
    const interviews = applications.filter((application) => application.status === "interview").length;
    const offers = applications.filter((application) => application.status === "offer").length;
    const followUpsDue = applications.filter((application) => isDueOrOverdue(application.next_follow_up_date, today)).length;

    return { activeApplications, interviews, offers, followUpsDue };
  }, [applications, today]);

  return (
    <section className="job-applications" aria-label="Job applications">
      <div className="section-heading">
        <div>
          <h2>Job Applications</h2>
          <p>Track submitted roles globally across the app with a drag-and-drop hiring pipeline.</p>
        </div>
        <div className="job-app-board-actions">
          <button className="ghost-button" type="button" onClick={onRefresh}>
            Refresh board
          </button>
          <button className="primary-button" type="button" onClick={onAdd}>
            Add application
          </button>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card total-card">
          <span>Active applications</span>
          <strong>{summary.activeApplications}</strong>
        </div>
        <div className="summary-card">
          <span>Interviews</span>
          <strong>{summary.interviews}</strong>
        </div>
        <div className="summary-card">
          <span>Offers</span>
          <strong>{summary.offers}</strong>
        </div>
        <div className="summary-card">
          <span>Follow-ups due</span>
          <strong>{summary.followUpsDue}</strong>
        </div>
      </div>

      <div className="filters">
        <label>
          Search
          <input
            type="search"
            placeholder="Company, role, location, notes"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>

        <label>
          Follow-up
          <select value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value as FollowUpFilter)}>
            <option value="all">All applications</option>
            <option value="due_or_overdue">Due today or overdue</option>
            <option value="overdue">Overdue only</option>
          </select>
        </label>

        <label className="job-toggle-filter">
          Closed stages
          <span>
            <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
            Show rejected, withdrawn, and ghosted
          </span>
        </label>
      </div>

      {error ? (
        <section className="alert" role="alert">
          {error}
        </section>
      ) : null}

      {isLoading ? (
        <p className="loading-state">Loading job applications...</p>
      ) : (
        <div className="job-board" role="list" aria-label="Job application pipeline">
          {boardColumns.map((column) => (
            <section
              className={`job-column ${draggedId ? "column-drop-ready" : ""}`}
              key={column.status}
              role="listitem"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const application = applications.find((candidate) => candidate.id === draggedId);
                setDraggedId(null);

                if (application && application.status !== column.status) {
                  onMove(application, column.status);
                }
              }}
            >
              <header className="job-column-header">
                <div>
                  <span>{labelFor(column.status)}</span>
                  <strong>{column.applications.length}</strong>
                </div>
              </header>

              <div className="job-card-stack">
                {column.applications.length === 0 ? <p className="job-column-empty">No applications</p> : null}
                {column.applications.map((application) => (
                  <article
                    key={application.id}
                    className={`job-card ${isSaving ? "job-card-disabled" : ""}`}
                    draggable={!isSaving}
                    onDragStart={() => setDraggedId(application.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onClick={() => onEdit(application)}
                  >
                    <div className="job-card-header">
                      <JobApplicationStatusBadge status={application.status} />
                      {application.job_url ? (
                        <a
                          href={application.job_url}
                          target="_blank"
                          rel="noreferrer"
                          className="ghost-button"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Open link
                        </a>
                      ) : null}
                    </div>

                    <div className="job-card-body">
                      <h3>{application.company}</h3>
                      <p>{application.role}</p>
                    </div>

                    <dl className="job-card-details">
                      <Detail label="Applied" value={formatDate(application.date_applied)} />
                      <Detail label="Location" value={application.location} />
                      <Detail label="Follow-up" value={formatDate(application.next_follow_up_date)} />
                    </dl>

                    <p className="job-card-notes">{application.notes || "No notes yet."}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function compareApplications(a: JobApplicationRecord, b: JobApplicationRecord) {
  if (a.next_follow_up_date && b.next_follow_up_date) {
    const followUpComparison = a.next_follow_up_date.localeCompare(b.next_follow_up_date);
    if (followUpComparison) {
      return followUpComparison;
    }
  } else if (a.next_follow_up_date) {
    return -1;
  } else if (b.next_follow_up_date) {
    return 1;
  }

  const appliedComparison = b.date_applied.localeCompare(a.date_applied);
  if (appliedComparison) {
    return appliedComparison;
  }

  return b.updated_at.localeCompare(a.updated_at);
}

function formatDate(value: string) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function getTodayDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDueOrOverdue(date: string, today: string) {
  return Boolean(date) && date <= today;
}

function isOverdue(date: string, today: string) {
  return Boolean(date) && date < today;
}
