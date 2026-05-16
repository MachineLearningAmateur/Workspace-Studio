import type { JobApplicationStatus } from "../types/tracker";
import { labelFor } from "../types/tracker";

interface JobApplicationStatusBadgeProps {
  status: JobApplicationStatus;
}

const statusClass: Record<JobApplicationStatus, string> = {
  applied: "job-status-applied",
  recruiter_screen: "job-status-recruiter-screen",
  interview: "job-status-interview",
  offer: "job-status-offer",
  rejected: "job-status-rejected",
  withdrawn: "job-status-withdrawn",
  ghosted: "job-status-ghosted"
};

export function JobApplicationStatusBadge({ status }: JobApplicationStatusBadgeProps) {
  return <span className={`status-badge ${statusClass[status]}`}>{labelFor(status)}</span>;
}
