import type { PlanSummary } from "../types/tracker";

interface PlanManagerProps {
  plans: PlanSummary[];
  deletingPlanId: string | null;
  error: string | null;
  onDeletePlan: (planId: string) => void;
}

export function PlanManager({ plans, deletingPlanId, error, onDeletePlan }: PlanManagerProps) {
  return (
    <section className="plan-manager" aria-label="Plan manager">
      <div className="section-heading">
        <div>
          <h2>Plans</h2>
          <p>Manage saved plans here. Use Open Chat to create, append, or replace plan rows from markdown.</p>
        </div>
      </div>

      {error ? (
        <section className="alert" role="alert">
          {error}
        </section>
      ) : null}

      <div className="plan-table" aria-label="Available plans">
        <div className="plan-table-header">
          <span>Plan</span>
          <span>Status</span>
          <span>CSV</span>
          <span>Actions</span>
        </div>
        {plans.map((plan) => (
          <article className="plan-row" key={plan.id}>
            <div>
              <strong>{plan.name}</strong>
              <p>{plan.revision_message}</p>
              {plan.source_files.length > 0 ? <small>{plan.source_files.join(", ")}</small> : null}
            </div>
            <span>{formatStatus(plan.revision_status)}</span>
            <code>{plan.csv_path}</code>
            <div className="plan-actions">
              <button
                className="danger-button"
                type="button"
                disabled={deletingPlanId === plan.id}
                onClick={() => {
                  if (window.confirm(`Delete "${plan.name}" and its CSV files?`)) {
                    onDeletePlan(plan.id);
                  }
                }}
              >
                {deletingPlanId === plan.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatStatus(status: PlanSummary["revision_status"]) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
