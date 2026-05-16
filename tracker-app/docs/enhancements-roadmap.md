# Enhancements and Roadmap

This document tracks the major improvements added to the Interview Prep Activity Tracker and captures practical next upgrades.

## Enhancements Added

### Multi-plan curriculum tracking

- Added plan selection on the main page.
- Added a Plans tab for managing saved plans.
- Each plan gets its own CSV under `./data/plans/<plan-id>/study_activities.csv`.
- Added plan deletion, including cleanup of the plan-specific CSV directory.
- Added backend plan creation jobs so Codex plan generation can show progress while it runs.
- Added fallback CSV generation when Codex is disabled or fails.

### Codex plan generation and revision

- Added `CODEX_REVISE_COMMAND` support for backend Codex curriculum revision.
- Stored uploaded markdown and generated Codex prompts for debugging.
- Added progress reporting from Codex JSON events during plan creation.
- Improved fallback handling when Codex fails so users still get a usable starter CSV.
- Added plan replacement from valid Codex-generated CSV previews.

### Codex chat interface

- Added a Chat tab for prompting Codex with the active tracker plan.
- Added persistent chat sessions.
- Added chat session deletion.
- Added markdown source uploads for reusable context.
- Added source deletion.
- Added adaptive progress mode so Codex can review completed work, weak areas, confidence, results, and target dates.
- Added CSV preview parsing from Codex responses.
- Added actions to save a valid preview as a new plan or replace the active plan.
- Improved markdown source upload UX with a clear upload button, `.md` validation, and inline upload status.
- Combined open chat and guided sessions into one top-level Chat tab with an in-tab mode switch.

### Guided learning sessions

- Added guided sessions for turning a tracker task into an interactive Codex tutoring session.
- Added learning-session storage under `./data/learning-sessions`.
- Added session deletion.
- Added session draft, message, and evaluation jobs.
- Added visible Codex activity while a session job is running.
- Added recovery for missing/stale in-memory job IDs after backend restarts.
- Hardened session jobs so a loaded session snapshot can be saved even if the session file is temporarily missing at completion time.
- Recovered an orphaned Codex-generated lesson into a normal learning session.
- Changed session prompting so Codex gives a compact intro, goals, roadmap, Step 1, and one checkpoint instead of a full lesson dump.
- Changed follow-up prompting so Codex moves step by step and asks one focused question or exercise at a time.

### Knowledge base

- Added `./data/knowledge-base.md` as a living knowledge base.
- Approved session evaluations append knowledge entries.
- Added a Knowledge Base panel in Guided Sessions.
- Added knowledge-base rebuild from approved learning sessions.
- Included learning-session and knowledge-base context in future Codex chat and plan-generation prompts.

### Markdown rendering

- Added session transcript markdown rendering.
- Supported basic headings, bold text, inline code, fenced code blocks, bullet lists, numbered lists, and line breaks.
- Styled markdown code blocks and inline code in both light and dark themes.

### Theme and local launcher

- Added dark mode as the default.
- Added a persistent light/dark theme toggle.
- Changed the theme toggle to a pill control showing the active icon and knob position:
  - Dark: `moon | knob`
  - Light: `knob | sun`
- Added a quiet Windows launcher script.
- Added a compiled Windows executable launcher path for running the site without a visible terminal.

### CSV and validation reliability

- Added stricter CSV validation for tracker rows.
- Improved update paths for plan-specific CSVs.
- Added safeguards around Codex evaluation fields before writing them to CSV.
- Added error handling for plan, source, chat, learning-session, and knowledge-base services.
- Fixed handling for malformed Codex CSV output by falling back instead of breaking plan creation.

## Current Architecture Notes

- The tracker remains local-first and CSV-backed.
- Plans, sources, chat sessions, learning sessions, and the knowledge base are stored in `./data`.
- Long-running Codex operations are represented as in-memory jobs.
- Persisted artifacts survive restarts, but in-memory job IDs do not.
- The frontend polls job endpoints for progress.
- Codex commands are configurable through environment variables:
  - `CODEX_REVISE_COMMAND`
  - `CODEX_CHAT_COMMAND`
  - `CODEX_SESSION_COMMAND`

## Next Potential Upgrades

### Highest value

- Persist job state to disk so active jobs survive backend restarts.
- Replace polling with Server-Sent Events or WebSockets for live Codex progress.
- Keep markdown rendering consistent across Open Chat and Guided Sessions.
- Add a dedicated source viewer so uploaded markdown can be inspected before being used.
- Add a session stepper UI that separates Objective, Goals, Roadmap, Current Step, Checkpoint, and History.
- Add a "Continue to next step" button so the learning flow is less dependent on free-form prompting.

### Learning intelligence

- Track mastery by category, pattern, and task type in the knowledge base.
- Create an explicit "known / shaky / unknown" skill matrix from completed sessions.
- Have Codex generate targeted review tasks from the knowledge base.
- Add spaced repetition scheduling based on confidence, result, and session evaluation.
- Add a lightweight quiz mode for each learning session.
- Add a "review this completed task" button directly on tracker rows.

### Plan generation

- Let Codex compare multiple plans and merge them into one curriculum.
- Add plan version history and rollback.
- Add a diff view before replacing an existing plan CSV.
- Allow partial plan updates instead of full CSV replacement.
- Let users pin protected rows that Codex should not delete or change.
- Add target company or role profiles to shape generated plans.

### UX improvements

- Add search/filter for learning sessions.
- Add source selection groups or tags.
- Add drag-and-drop markdown upload.
- Show file upload progress and size validation before reading the file.
- Add "archive" for old sessions and plans instead of only delete.
- Add empty-state guidance for first-time users.
- Add keyboard shortcuts for switching tabs and creating sessions.

### Reliability and testing

- Add automated API tests for plans, sources, chat sessions, learning sessions, and knowledge-base rebuild.
- Add frontend component tests for upload, markdown rendering, theme toggle, and session evaluation.
- Add end-to-end Playwright tests for the full learning-session flow.
- Add CSV repair tooling for common parse failures.
- Add structured logs for Codex command starts, exits, timeouts, and output paths.
- Add configurable cleanup for old Codex output files.

### Data and portability

- Add export/import for all app data.
- Add backup snapshots before plan replacement or deletion.
- Add a data integrity check page.
- Add support for choosing a custom data directory from the launcher.
- Add optional SQLite storage while preserving CSV export.

### Security and safety

- Add command configuration validation and safer command previews.
- Redact sensitive tokens or local paths from visible Codex progress when needed.
- Add confirmation before using large source sets in Codex prompts.
- Add prompt size estimates before sending jobs to Codex.
- Add a local-only warning if the app is ever bound outside `127.0.0.1`.

## Suggested Next Milestones

1. Persist job state and add live progress streaming.
2. Upgrade Guided Sessions into a structured stepper experience.
3. Render markdown in both Open Chat and Guided Sessions with the shared renderer.
4. Add source viewer, tagging, and drag-and-drop uploads.
5. Add plan diff and rollback before replacing CSV content.
