import type { ActivityRow } from "../types/tracker";

interface SummaryCardsProps {
  rows: ActivityRow[];
}

export function SummaryCards({ rows }: SummaryCardsProps) {
  const doneRows = rows.filter((row) => row.status === "done");
  const reviewAgainCount = rows.filter((row) => row.status === "review_again").length;
  const hintedOrSolutionCount = rows.filter((row) => row.result === "solved_with_hint" || row.result === "needed_solution").length;
  const totalMinutes = rows.reduce((total, row) => total + Number(row.time_spent_min || 0), 0);
  const averageConfidence = average(
    rows.map((row) => Number(row.confidence)).filter((value) => Number.isFinite(value) && value > 0)
  );

  return (
    <section className="summary-grid" aria-label="Tracker summary">
      <div className="summary-card total-card">
        <span>Total activities</span>
        <strong>{rows.length}</strong>
      </div>
      <div className="summary-card">
        <span>Completed</span>
        <strong>{doneRows.length}</strong>
      </div>
      <div className="summary-card">
        <span>Time spent</span>
        <strong>{totalMinutes}</strong>
        <small>minutes</small>
      </div>
      <div className="summary-card">
        <span>Avg confidence</span>
        <strong>{averageConfidence ? averageConfidence.toFixed(1) : "-"}</strong>
      </div>
      <div className="summary-card">
        <span>Review again</span>
        <strong>{reviewAgainCount}</strong>
      </div>
      <div className="summary-card">
        <span>Hint or solution</span>
        <strong>{hintedOrSolutionCount}</strong>
      </div>
    </section>
  );
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}
