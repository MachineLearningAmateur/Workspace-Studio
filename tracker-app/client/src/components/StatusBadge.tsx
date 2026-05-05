import type { Status } from "../types/tracker";
import { labelFor } from "../types/tracker";

interface StatusBadgeProps {
  status: Status;
}

const statusClass: Record<Status, string> = {
  not_started: "status-not-started",
  in_progress: "status-in-progress",
  done: "status-done",
  skipped: "status-skipped",
  review_again: "status-review-again"
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge ${statusClass[status]}`}>{labelFor(status)}</span>;
}
