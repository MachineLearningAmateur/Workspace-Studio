# Interview Prep Activity Tracker

A local-first website for tracking interview prep in a normalized CSV file. The CSV is the source of truth and uses one row per study activity.

## What It Does

- Creates a missing CSV file with the required header.
- Reads activity rows through an Express API.
- Appends one new study activity at a time.
- Validates dates, enum fields, time spent, and confidence before writing.
- Shows a React dashboard with summaries, filters, search, table view, add form, and row editing.

## Setup

```bash
cd tracker-app
npm install
```

## Run Locally

Start the frontend and backend together:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

The API runs on:

```text
http://127.0.0.1:3001
```

## CSV Path

By default, the backend uses:

```text
./data/study_activities.csv
```

Override it with `TRACKER_CSV_PATH`:

```bash
TRACKER_CSV_PATH=./data/my-activities.csv npm run dev:server
```

PowerShell:

```powershell
$env:TRACKER_CSV_PATH = "./data/my-activities.csv"
npm run dev:server
```

## CSV Schema

When the file is missing, the backend creates it with this exact header:

```csv
date,category,item_type,item_name,difficulty,status,time_spent_min,confidence,attempt_type,result,pattern,interview_relevance,scheduled_date,completed_at,source,notes
```

Rows are written as standard UTF-8 CSV. Commas, quotes, and line breaks in free-text fields are escaped by the CSV writer.

## API Examples

Get all rows:

```bash
curl http://127.0.0.1:3001/api/tracker
```

Append one activity:

```bash
curl -X POST http://127.0.0.1:3001/api/tracker \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"2026-04-20\",\"category\":\"sliding_window\",\"item_type\":\"leetcode_new\",\"item_name\":\"Longest Substring Without Repeating Characters\",\"difficulty\":\"medium\",\"status\":\"done\",\"time_spent_min\":\"42\",\"confidence\":\"3\",\"attempt_type\":\"first_try\",\"result\":\"solved_with_hint\",\"pattern\":\"sliding_window\",\"interview_relevance\":\"high\",\"scheduled_date\":\"2026-04-20\",\"completed_at\":\"2026-04-20T20:15\",\"source\":\"neetcode150\",\"notes\":\"Forgot how to shrink the window correctly\"}"
```

Edit row index `0`:

```bash
curl -X PUT http://127.0.0.1:3001/api/tracker/0 \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"2026-04-20\",\"category\":\"sliding_window\",\"item_type\":\"leetcode_new\",\"item_name\":\"Longest Substring Without Repeating Characters\",\"difficulty\":\"medium\",\"status\":\"review_again\",\"time_spent_min\":\"42\",\"confidence\":\"3\",\"attempt_type\":\"first_try\",\"result\":\"solved_with_hint\",\"pattern\":\"sliding_window\",\"interview_relevance\":\"high\",\"scheduled_date\":\"2026-04-20\",\"completed_at\":\"2026-04-20T20:15\",\"source\":\"neetcode150\",\"notes\":\"Need to re-solve without hints\"}"
```

Reset to header only:

```bash
curl -X POST http://127.0.0.1:3001/api/tracker/reset
```

## Validation

The backend enforces:

- `date` uses `YYYY-MM-DD`
- `category`, `item_type`, `status`, `interview_relevance`, and other enum fields use approved lower_snake_case values
- `time_spent_min` is an integer greater than or equal to `0` when provided
- `confidence` is an integer from `1` to `5` when provided
- empty strings are preserved for optional fields that do not apply

## Checks

```bash
npm run typecheck
npm run build
```
