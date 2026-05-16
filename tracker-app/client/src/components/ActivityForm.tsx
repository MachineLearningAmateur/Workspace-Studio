import { useEffect, useRef, useState } from "react";
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
          Scheduled date/time
          <DateTimeControls
            value={value.scheduled_date}
            allowDateOnly
            onChange={(nextValue) => updateField("scheduled_date", nextValue)}
          />
        </label>

        <label>
          Completed at
          <DateTimeControls value={value.completed_at} onChange={(nextValue) => updateField("completed_at", nextValue)} />
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

function DateTimeControls({
  value,
  allowDateOnly = false,
  onChange
}: {
  value: string;
  allowDateOnly?: boolean;
  onChange: (value: string) => void;
}) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const date = getDatePart(value);
  const time = getTimePart(value);
  const [includeTime, setIncludeTime] = useState(Boolean(time) || (!allowDateOnly && Boolean(date)));
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [pickerHour, setPickerHour] = useState("00");
  const [pickerMinute, setPickerMinute] = useState("00");

  useEffect(() => {
    setIncludeTime(Boolean(time) || (!allowDateOnly && Boolean(date)));
  }, [allowDateOnly, date, time]);

  useEffect(() => {
    setPickerHour(time.slice(0, 2) || "00");
    setPickerMinute(time.slice(3, 5) || "00");
  }, [time]);

  function updateDate(nextDate: string) {
    if (!nextDate) {
      onChange("");
      return;
    }

    const shouldIncludeTime = !allowDateOnly || includeTime;
    const nextTime = shouldIncludeTime ? time || getCurrentLocalTime() : "";
    onChange(formatDateTimeValue(nextDate, nextTime, allowDateOnly));
  }

  function updateTime(nextTime: string) {
    if (!date) {
      return;
    }

    onChange(formatDateTimeValue(date, nextTime, allowDateOnly));
  }

  function updateIncludeTime(nextIncludeTime: boolean) {
    setIncludeTime(nextIncludeTime);

    if (!date) {
      return;
    }

    onChange(formatDateTimeValue(date, nextIncludeTime ? time : "", allowDateOnly));
  }

  function openTimePicker() {
    setPickerHour(time.slice(0, 2) || "00");
    setPickerMinute(time.slice(3, 5) || "00");
    setIsTimePickerOpen(true);
  }

  function applyTimePicker() {
    updateTime(`${pickerHour}:${pickerMinute}`);
    setIsTimePickerOpen(false);
  }

  return (
    <span className="date-time-controls">
      <span className="date-time-inline">
        <input ref={dateInputRef} type="date" value={date} aria-label="Date" onChange={(event) => updateDate(event.target.value)} />
        <button className="date-time-picker-button" type="button" onClick={() => openNativePicker(dateInputRef.current)}>
          Pick date
        </button>
      </span>
      {allowDateOnly ? (
        <label className="date-time-toggle">
          <input type="checkbox" checked={includeTime} onChange={(event) => updateIncludeTime(event.target.checked)} />
          Include time
        </label>
      ) : null}
      {!allowDateOnly || includeTime ? (
        <span className="date-time-inline">
          <input
            ref={timeInputRef}
            type="time"
            value={time}
            disabled={!date}
            aria-label="Time"
            step="60"
            onChange={(event) => updateTime(event.target.value)}
          />
          <button className="date-time-picker-button" type="button" disabled={!date} onClick={openTimePicker}>
            Pick time
          </button>
        </span>
      ) : null}
      {(!allowDateOnly || includeTime) && isTimePickerOpen && date ? (
        <span className="time-picker-popover" role="dialog" aria-label="Choose time">
          <span className="time-picker-selects">
            <label>
              Hour
              <select value={pickerHour} onChange={(event) => setPickerHour(event.target.value)}>
                {hourOptions.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Minute
              <select value={pickerMinute} onChange={(event) => setPickerMinute(event.target.value)}>
                {minuteOptions.map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
              </select>
            </label>
          </span>
          <span className="time-picker-actions">
            <button className="ghost-button" type="button" onClick={() => setIsTimePickerOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={applyTimePicker}>
              Set time
            </button>
          </span>
        </span>
      ) : null}
      <button className="ghost-button" type="button" onClick={() => onChange("")}>
        Clear
      </button>
    </span>
  );
}

function getDatePart(value: string) {
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
}

function getTimePart(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

function formatDateTimeValue(date: string, time: string, allowDateOnly: boolean) {
  if (!date) {
    return "";
  }

  if (!time && allowDateOnly) {
    return date;
  }

  return `${date}T${time || "00:00"}`;
}

function getCurrentLocalTime() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function openNativePicker(input: HTMLInputElement | null) {
  if (!input || input.disabled) {
    return;
  }

  if (typeof input.showPicker === "function") {
    input.showPicker();
    return;
  }

  input.focus();
  input.click();
}

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
