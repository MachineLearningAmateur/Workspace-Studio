# Interview Prep Tracker Website Spec

## Objective
Build a small local-first website that lets me view and update my interview prep tracker. The app should read from and write to a CSV file so I can track my current study status by day.

This app is intended for personal use. It does not need authentication.

---

## Primary Use Case
I want a website where I can:

1. See my study plan by date.
2. View my current status for each day.
3. Update the status and notes for a given day.
4. Persist those updates back to a CSV file.
5. Quickly understand what is done, in progress, skipped, or needs review.

---

## Recommended Tech Stack
Use a simple stack that Codex can implement reliably.

### Preferred option
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- CSV handling: `csv-parse` and `csv-stringify` or equivalent
- Styling: simple CSS or a lightweight utility approach

### Important constraints
- The backend must be responsible for reading and writing the CSV file.
- The frontend should never write directly to the filesystem.
- Keep the architecture simple and easy to run locally.
- No database. CSV is the source of truth.

---

## App Behavior

### Dashboard page
Display all tracker rows in a table.

Each row should show:
- Date
- Focus
- LeetCode Review
- New LeetCode Problems
- System Design
- Behavioral / Communication
- Status
- Notes

### Editing behavior
I should be able to update at least these fields from the UI:
- Status
- Notes

Nice to have:
- Ability to also edit focus or study task text fields
- Ability to mark a row complete quickly

### Filtering and sorting
Support:
- Sort by date ascending by default
- Filter by status
- Filter by focus

### Visual cues
Use simple visual indicators for status values:
- Not started
- In progress
- Done
- Skipped
- Review again

A colored badge is enough.

---

## CSV Schema
The CSV file should contain one row per day.

Use these columns exactly:

```csv
Date,Focus,LeetCode Review,New LeetCode Problems,System Design,Behavioral / Communication,Status,Notes
```

### Sample CSV content
Use this as the seed file if no CSV exists yet.

```csv
Date,Focus,LeetCode Review,New LeetCode Problems,System Design,Behavioral / Communication,Status,Notes
2026-04-17,Reset + baseline,"Two Sum, Valid Anagram","Group Anagrams, Top K Frequent Elements","Learn answer framework: requirements, APIs, components, bottlenecks, tradeoffs","Write bullets for OAuth/token validation project + one ownership story",Not started,
2026-04-18,Arrays & Hashing,"Product of Array Except Self","Longest Consecutive Sequence, Encode/Decode Strings or similar","Core components: LB, app servers, cache, DB, queue","Prepare challenging bug / prod issue story",Not started,
2026-04-19,Two Pointers + Stack,"Valid Palindrome, Valid Parentheses","3Sum, Daily Temperatures, Car Fleet if time","Cache basics: cache-aside, TTL, stale data, eviction","Explain 3Sum out loud",Not started,
2026-04-20,Sliding Window,"Best Time to Buy and Sell Stock","Longest Substring Without Repeating Characters, Longest Repeating Character Replacement","Design a rate limiter","Prepare tradeoff story",Not started,
2026-04-21,Binary Search,"Binary Search","Search in Rotated Sorted Array, Find Minimum in Rotated Sorted Array","SQL vs NoSQL, indexing basics","Explain one coding solution out loud",Not started,
2026-04-22,Linked List,"Reverse Linked List","Linked List Cycle, Merge Two Sorted Lists, Reorder List if time","API design basics: endpoints, idempotency, pagination","Prepare cross-team collaboration story",Not started,
2026-04-23,Intervals,"Merge Intervals","Insert Interval, Non-overlapping Intervals","Design a URL shortener","10-minute design walkthrough",Not started,
2026-04-24,Trees I,"Maximum Depth of Binary Tree","Same Tree, Invert Binary Tree, Level Order Traversal","Replication vs sharding","Prepare ownership story",Not started,
2026-04-25,Trees II + BST,"Diameter of Binary Tree or Max Depth redo","Validate BST, LCA of BST or Kth Smallest in BST","Design an authentication service","Explain auth design like an interview answer",Not started,
2026-04-26,Heap / Priority Queue,"Last Stone Weight or Kth Largest in Stream","Kth Largest Element in Array, Task Scheduler or Top K Frequent (heap)","Queues, retries, idempotency, DLQ idea","Explain heap choice clearly",Not started,
2026-04-27,Backtracking,Subsets,"Combination Sum, Permutations","Design a notification service","Prepare ambiguity / unclear requirements story",Not started,
2026-04-28,Graphs,"Number of Islands","Clone Graph, Rotting Oranges or Pacific Atlantic","Observability: logs, metrics, tracing, alerts","Practice graph traversal explanation",Not started,
2026-04-29,1-D DP,"Climbing Stairs","House Robber, Coin Change","Design a file upload service","Prepare reliability/performance story",Not started,
2026-04-30,Mock Day 1,"Review weakest recent problem","1 easy + 1 timed medium","Design an API gateway with auth","Explain brute force -> optimal clearly",Not started,
2026-05-01,Weak Area Repair,"Re-solve 3 weak-area problems","1 new medium if energy allows","Review cache, queue, DB, LB, CDN, rate limiter","Refine top 5 stories",Not started,
2026-05-02,Timed Practice,"1 old medium","2 timed mediums","20-minute mock: URL shortener or auth service","Practice Tell me about yourself + Why looking?",Not started,
2026-05-03,Full Mock Day,"1 familiar re-solve","1 full 45-minute coding mock","1 full 30-40 minute design mock","STAR story rehearsal",Not started,
2026-05-04,Light Review,"2 familiar mediums","1 easy confidence problem","Review design template only","Review concise story bullets",Not started,
2026-05-05,Interview Maintenance,"1 easy","None or light review only","Mental rehearsal of design framework","Review OAuth, bug, tradeoff, ownership stories",Not started,
```

---

## Status Values
Allowed status values:
- Not started
- In progress
- Done
- Skipped
- Review again

Do not allow arbitrary status values from the UI.
Use a dropdown/select control.

---

## Backend Requirements

### File location
The backend should read and write a single CSV file at a configurable path.
Use an environment variable if helpful, for example:

```bash
TRACKER_CSV_PATH=./data/tracker.csv
```

If the file does not exist:
- create the parent directory if needed
- initialize the CSV file with the sample seed content above

### API endpoints
Implement these endpoints.

#### `GET /api/tracker`
Returns all rows from the CSV as JSON.

Example response:

```json
[
  {
    "Date": "2026-04-17",
    "Focus": "Reset + baseline",
    "LeetCode Review": "Two Sum, Valid Anagram",
    "New LeetCode Problems": "Group Anagrams, Top K Frequent Elements",
    "System Design": "Learn answer framework: requirements, APIs, components, bottlenecks, tradeoffs",
    "Behavioral / Communication": "Write bullets for OAuth/token validation project + one ownership story",
    "Status": "Not started",
    "Notes": ""
  }
]
```

#### `PUT /api/tracker/:date`
Update a single row identified by `Date`.

Path param example:
- `2026-04-17`

Request body should support updating at least:

```json
{
  "Status": "In progress",
  "Notes": "Finished 1 review problem and 1 new problem"
}
```

Nice to support updating all editable fields, but at minimum `Status` and `Notes`.

Behavior:
- validate that the row exists
- validate status if status is provided
- update the row in memory
- rewrite the CSV file safely
- return the updated row as JSON

#### Optional: `POST /api/tracker/reset`
Reset the CSV back to seed content.
This is optional but useful for local testing.

---

## CSV Write Safety
When writing updates:
- avoid corrupting the file on partial writes
- write to a temporary file first, then replace the original file
- preserve header order exactly

---

## Frontend Requirements

### Main page layout
Single page app with:
- page title
- small summary section
- filters
- tracker table
- row edit interaction

### Summary section
Show simple counts:
- total rows
- done
- in progress
- not started
- skipped
- review again

### Table behavior
Each row should include:
- date
- focus
- study columns
- status badge
- notes preview
- edit action

### Edit interaction
At minimum, provide one of these patterns:
- inline editing in table row, or
- edit modal / side panel

Required editable fields:
- Status
- Notes

Nice to have:
- Save button
- Cancel button
- optimistic UI or just refetch after save

### UX details
- Default sort: ascending by date
- Add search text input for focus or notes if easy
- Keep styling simple and readable
- Make it usable on laptop width without fancy design work

---

## Suggested Frontend Data Model
Use a TypeScript interface like:

```ts
export interface TrackerRow {
  Date: string;
  Focus: string;
  "LeetCode Review": string;
  "New LeetCode Problems": string;
  "System Design": string;
  "Behavioral / Communication": string;
  Status: "Not started" | "In progress" | "Done" | "Skipped" | "Review again";
  Notes: string;
}
```

---

## Suggested Project Structure

```text
tracker-app/
  client/
    src/
      components/
        TrackerTable.tsx
        TrackerFilters.tsx
        StatusBadge.tsx
        EditRowModal.tsx
        SummaryCards.tsx
      api/
        trackerApi.ts
      types/
        tracker.ts
      App.tsx
      main.tsx
  server/
    src/
      routes/
        tracker.ts
      services/
        csvStore.ts
      seed/
        trackerSeed.ts
      index.ts
  data/
    tracker.csv
  package.json
  README.md
```

Codex can adjust structure if needed, but keep responsibilities separated.

---

## Backend Implementation Notes

### CSV store service
Create a service module responsible for:
- loading CSV rows
- validating rows
- finding a row by date
- updating a row
- saving rows back to CSV
- seeding the file if missing

### Validation
Validate:
- required columns exist
- `Date` is unique per row
- `Status` is one of allowed values

### Error handling
Return clean JSON errors for:
- row not found
- invalid status
- malformed CSV
- server write failure

Example:

```json
{
  "error": "Tracker row not found for date 2026-04-17"
}
```

---

## Acceptance Criteria
The app is complete when all of the following are true:

1. Running the app locally shows the tracker in a browser.
2. If no CSV exists, the app seeds one automatically.
3. The frontend loads tracker data from the backend.
4. I can update a row's status.
5. I can update a row's notes.
6. Refreshing the page shows persisted updates from the CSV file.
7. Summary counts update correctly.
8. Invalid status values are rejected by the backend.
9. The CSV file remains valid after multiple edits.
10. The code is simple, readable, and easy to modify.

---

## Nice-to-Have Features
Implement these only after the core flow works:

- quick action buttons like "Mark Done"
- editable focus/tasks
- row highlighting for today's date
- progress percentage
- export JSON snapshot
- dark mode toggle
- local search box

---

## Non-Goals
Do not spend time on:
- authentication
- multi-user support
- cloud deployment
- database integration
- complex design systems
- mobile app support

This should be a small local productivity app.

---

## README Requirements
Ask Codex to include a README with:
- setup steps
- install commands
- how to run frontend and backend
- how to configure CSV path
- how seed behavior works
- example API usage

---

## Implementation Instructions for Codex
1. Create the full project scaffold.
2. Implement backend CSV read/write with safe file writes.
3. Seed the CSV automatically if missing.
4. Implement `GET /api/tracker`.
5. Implement `PUT /api/tracker/:date`.
6. Implement the frontend table view.
7. Implement row editing for status and notes.
8. Add summary counts and filters.
9. Add a README with run instructions.
10. Keep code clean and minimal.

---

## Final Note
Prioritize correctness and simplicity over polish. The most important requirement is that the website correctly reads from and writes to the CSV file so I can reliably track my interview prep status.
