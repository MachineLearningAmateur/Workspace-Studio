# Product Spec

## Objective

Track interview-prep activity locally while allowing multiple curriculum plans. The CSV files remain the source of truth.

## Core Requirements

- No authentication.
- No database.
- Backend owns all filesystem access.
- Frontend talks to the backend API only.
- Each plan has an independent CSV.
- The main tracker page can select the active plan.
- The Plans tab manages saved plans. Open Chat handles markdown-to-plan conversion through CSV previews.
- Uploaded plans can be deleted.
- Codex revision uses a local default command and can be overridden or disabled through an environment command.
- The Chat tab can prompt Codex with selected markdown sources and tracker history.
- Adaptive chat can review completed work and weak signals to generate a deadline-focused CSV preview.
- The Profile tab stores resume and background context for STAR prep and personalized Codex guidance.

## Primary Screens

### Tracker

- Active plan selector
- Summary cards
- Add activity form
- Filters
- Grouped activity list
- Edit activity modal

### Plans

- Available plans list with revision status and CSV path
- Delete action for uploaded plans

### Chat

- Single top-level Chat tab with Open Chat and Guided Sessions modes
- Persistent chat sessions
- Global markdown source library
- Source selection per prompt
- Optional target date
- General Codex prompt action
- Adaptive progress prompt action
- Validated CSV preview with explicit save actions
- Guided learning sessions from tracker tasks
- Session review flow that can update tracker rows and the knowledge base

### Profile

- Resume upload for `.docx`, `.md`, and `.txt` files
- Editable resume text
- Codex-generated background notes from the resume
- Additional background notes for STAR stories, target roles, and project context
- Saved profile context included in Open Chat and Guided Sessions

## Data Model

Plan metadata is stored in:

```text
./data/plans.json
```

Each plan stores:

- plan id
- display name
- CSV path
- uploaded markdown path
- generated Codex prompt path
- source filenames
- revision status
- revision message

Tracker rows use the normalized activity schema documented in [API reference](api.md).

## Acceptance Criteria

1. Running `npm run dev` starts the frontend and backend.
2. The default plan loads from the existing CSV path.
3. The main page can switch between plans.
4. New activity rows are written to the selected plan CSV.
5. Edited activity rows are written to the selected plan CSV.
6. Open Chat accepts markdown context and can return a validated CSV preview.
7. Creating a plan produces a new CSV and registry entry.
8. Deleting an uploaded plan removes its registry entry and plan directory.
9. Chat sessions and markdown sources persist in the data directory.
10. Adaptive chat includes completed rows and weak signals from the selected plan.
11. Valid chat CSV previews can be saved as new plans or used to replace the selected plan.
12. If `CODEX_REVISE_COMMAND` is configured, the backend sends the revision prompt to that command.
13. If Codex is not configured or fails, the app still creates a starter CSV.
14. Backend validation rejects malformed tracker CSV rows.
