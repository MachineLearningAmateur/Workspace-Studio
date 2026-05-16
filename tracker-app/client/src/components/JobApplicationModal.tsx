import { jobApplicationStatuses, labelFor } from "../types/tracker";
import type { JobApplicationInput, JobApplicationRecord } from "../types/tracker";

interface JobApplicationModalProps {
  mode: "create" | "edit";
  application: JobApplicationRecord | null;
  value: JobApplicationInput;
  isSaving: boolean;
  isDeleting: boolean;
  error: string | null;
  onChange: (value: JobApplicationInput) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function JobApplicationModal({
  mode,
  application,
  value,
  isSaving,
  isDeleting,
  error,
  onChange,
  onClose,
  onSave,
  onDelete
}: JobApplicationModalProps) {
  if (!application) {
    return null;
  }

  function updateField(field: keyof JobApplicationInput, nextValue: string) {
    onChange({
      ...value,
      [field]: nextValue
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="job-application-modal-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Job Application</p>
            <h2 id="job-application-modal-title">{mode === "create" ? "Add Application" : "Edit Application"}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose} aria-label="Close edit dialog">
            Close
          </button>
        </div>

        <form
          className="job-application-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label>
            Company
            <input type="text" required value={value.company} onChange={(event) => updateField("company", event.target.value)} />
          </label>

          <label>
            Role
            <input type="text" required value={value.role} onChange={(event) => updateField("role", event.target.value)} />
          </label>

          <label>
            Status
            <select required value={value.status} onChange={(event) => updateField("status", event.target.value)}>
              {jobApplicationStatuses.map((status) => (
                <option key={status} value={status}>
                  {labelFor(status)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Date applied
            <input type="date" required value={value.date_applied} onChange={(event) => updateField("date_applied", event.target.value)} />
          </label>

          <label className="wide-field">
            Job URL
            <input
              type="url"
              inputMode="url"
              placeholder="https://company.com/jobs/123"
              value={value.job_url}
              onChange={(event) => updateField("job_url", event.target.value)}
            />
          </label>

          <label>
            Location
            <input type="text" placeholder="Remote / Chicago, IL" value={value.location} onChange={(event) => updateField("location", event.target.value)} />
          </label>

          <label>
            Next follow-up date
            <input type="date" value={value.next_follow_up_date} onChange={(event) => updateField("next_follow_up_date", event.target.value)} />
          </label>

          <label className="wide-field">
            Notes
            <textarea rows={5} placeholder="Recruiter name, interview prep notes, referral context..." value={value.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="form-actions split-actions">
            {mode === "edit" ? (
              <button className="danger-button" type="button" disabled={isDeleting} onClick={onDelete}>
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            ) : (
              <span />
            )}
            <div className="inline-actions">
              <button className="ghost-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : mode === "create" ? "Create application" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
