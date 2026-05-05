import {
  attemptTypes,
  categories,
  difficulties,
  emptyActivityInput,
  interviewRelevanceValues,
  itemTypes,
  labelFor,
  results,
  statuses
} from "../types/tracker";
import type { ActivityInput } from "../types/tracker";

interface ActivityFormProps {
  title: string;
  submitLabel: string;
  value: ActivityInput;
  error: string | null;
  isSaving: boolean;
  onChange: (value: ActivityInput) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}

export function ActivityForm({
  title,
  submitLabel,
  value,
  error,
  isSaving,
  onChange,
  onSubmit,
  onCancel
}: ActivityFormProps) {
  function updateField(field: keyof ActivityInput, nextValue: string) {
    onChange({
      ...value,
      [field]: nextValue
    });
  }

  return (
    <section className="activity-form-section" aria-label={title}>
      <div className="section-heading">
        <h2>{title}</h2>
        <p>One CSV row per activity. Enum values are saved as lower_snake_case.</p>
      </div>

      <form
        className="activity-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label>
          Date
          <input type="date" required value={value.date} onChange={(event) => updateField("date", event.target.value)} />
        </label>

        <label>
          Category
          <select required value={value.category} onChange={(event) => updateField("category", event.target.value)}>
            {categories.map((category) => (
              <option value={category} key={category}>
                {labelFor(category)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Item type
          <select required value={value.item_type} onChange={(event) => updateField("item_type", event.target.value)}>
            {itemTypes.map((itemType) => (
              <option value={itemType} key={itemType}>
                {labelFor(itemType)}
              </option>
            ))}
          </select>
        </label>

        <label className="wide-field">
          Item name
          <input
            type="text"
            required
            placeholder="Group Anagrams"
            value={value.item_name}
            onChange={(event) => updateField("item_name", event.target.value)}
          />
        </label>

        <label>
          Difficulty
          <select value={value.difficulty} onChange={(event) => updateField("difficulty", event.target.value)}>
            <option value="">Not applicable</option>
            {difficulties.map((difficulty) => (
              <option value={difficulty} key={difficulty}>
                {labelFor(difficulty)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select required value={value.status} onChange={(event) => updateField("status", event.target.value)}>
            {statuses.map((status) => (
              <option value={status} key={status}>
                {labelFor(status)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Time spent
          <input
            type="number"
            min="0"
            step="1"
            placeholder="35"
            value={value.time_spent_min}
            onChange={(event) => updateField("time_spent_min", event.target.value)}
          />
        </label>

        <label>
          Confidence
          <input
            type="number"
            min="1"
            max="5"
            step="1"
            placeholder="1-5"
            value={value.confidence}
            onChange={(event) => updateField("confidence", event.target.value)}
          />
        </label>

        <label>
          Attempt type
          <select value={value.attempt_type} onChange={(event) => updateField("attempt_type", event.target.value)}>
            <option value="">Not applicable</option>
            {attemptTypes.map((attemptType) => (
              <option value={attemptType} key={attemptType}>
                {labelFor(attemptType)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Result
          <select value={value.result} onChange={(event) => updateField("result", event.target.value)}>
            <option value="">Not applicable</option>
            {results.map((result) => (
              <option value={result} key={result}>
                {labelFor(result)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Pattern
          <input
            type="text"
            placeholder="sliding_window"
            value={value.pattern}
            onChange={(event) => updateField("pattern", event.target.value)}
          />
        </label>

        <label>
          Interview relevance
          <select required value={value.interview_relevance} onChange={(event) => updateField("interview_relevance", event.target.value)}>
            {interviewRelevanceValues.map((relevance) => (
              <option value={relevance} key={relevance}>
                {labelFor(relevance)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Scheduled date
          <input
            type="date"
            value={value.scheduled_date}
            onChange={(event) => updateField("scheduled_date", event.target.value)}
          />
        </label>

        <label>
          Completed at
          <input
            type="datetime-local"
            value={value.completed_at}
            onChange={(event) => updateField("completed_at", event.target.value)}
          />
        </label>

        <label>
          Source
          <input
            type="text"
            placeholder="neetcode150"
            value={value.source}
            onChange={(event) => updateField("source", event.target.value)}
          />
        </label>

        <label className="wide-field">
          Notes
          <textarea
            rows={4}
            placeholder="Keep notes concise"
            value={value.notes}
            onChange={(event) => updateField("notes", event.target.value)}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions">
          {onCancel ? (
            <button className="ghost-button" type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <button className="ghost-button" type="button" onClick={() => onChange(emptyActivityInput)}>
              Clear
            </button>
          )}
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
