# Interview Prep Activity Tracker

A local-first React and Express app for managing interview prep through workspace boards, notebooks, Codex chat, and guided sessions. Managed workspaces use JSON plus Markdown-backed notes on disk, while older CSV plan workflows are still supported and can be migrated into normal workspaces.

## Quick Start

```bash
npm install
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

## Quiet Windows Launcher

Double-click:

```text
launcher\StartInterviewPrepTracker.vbs
```

This starts `npm run dev` in the background, opens the tracker in your browser, and writes server output to:

```text
launcher\tracker-launcher.log
```

There is also a C# launcher source if you want a compiled `.exe`. If the .NET SDK is installed, build with:

```powershell
dotnet build .\launcher\InterviewPrepTrackerLauncher.csproj -c Release
```

Run:

```text
launcher\bin\Release\net8.0-windows\InterviewPrepTrackerLauncher.exe
```

On this machine, the .NET Framework compiler is available even though the .NET SDK is not. This command builds a quiet Windows executable:

```powershell
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
New-Item -ItemType Directory -Path .\launcher\bin\Release\net48 -Force
& $csc /nologo /target:winexe /out:".\launcher\bin\Release\net48\InterviewPrepTrackerLauncher.exe" /reference:System.Windows.Forms.dll /reference:System.dll /reference:System.Drawing.dll ".\launcher\InterviewPrepTrackerLauncher.cs"
```

Run:

```text
launcher\bin\Release\net48\InterviewPrepTrackerLauncher.exe
```

## What It Does

- Keeps data on the local filesystem, not in a database.
- Supports managed workspaces with board cards stored in `tasks.json`, subjects stored in `subjects.json`, and workspace notes/notebooks stored under each workspace directory.
- Keeps notebook content exclusive to each workspace and autosaves the active notebook when switching between notebooks.
- Lets you create and delete managed workspaces from the app.
- Requires a double confirmation before deleting a managed workspace.
- Exposes a special job-search workspace backed by `./data/job-applications.json`.
- Keeps a Plans tab for CSV-backed legacy plans and markdown-to-plan generation.
- Creates and revises plans through Open Chat CSV previews.
- Saves valid Codex CSV previews as new plans, additions to the selected plan, or replacements for the selected plan.
- Lets legacy plan workspaces be migrated into normal managed workspaces from the workspace header.
- Preserves legacy workspace notebooks during plan-to-workspace migration and rewrites old Palantir-style chat/session references to the new workspace.
- Adds a unified Chat area for open Codex chat and guided learning sessions.
- Lets open chat prompt Codex with tracker progress, workspace context, selected markdown sources, and saved profile context.
- Drafts guided Codex lessons from individual tracker tasks or board cards.
- Lets Codex review completed sessions, update the source task/card, and maintain `./data/knowledge-base.md`.
- Optionally invokes Codex on the backend to revise a curriculum into a new plan CSV.
- Falls back to a starter CSV parsed from markdown when Codex is not configured.

## Codex Revision Command

By default, the backend hands uploaded markdown and the current curriculum to:

```text
codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -
```

Set `CODEX_REVISE_COMMAND` when you want to override that command. The command must read the prompt from stdin and write only the revised tracker CSV to stdout.
If the command uses `{outputFile}`, the backend replaces it with a temporary file path and reads the final Codex message from that file.

PowerShell example:

```powershell
$env:CODEX_REVISE_COMMAND = 'codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -'
npm run dev:server
```

To disable Codex revision and use markdown fallback rows:

```powershell
$env:CODEX_REVISE_COMMAND = "off"
npm run dev:server
```

If the command fails, the backend stores the prompt at:

```text
./data/plans/<plan-id>/codex-revision-prompt.md
```

and creates a starter CSV so the plan can still be selected and edited.

## Storage Layout

Managed workspace data lives under:

```text
./data/workspaces.json
./data/workspaces/<workspace-id>/subjects.json
./data/workspaces/<workspace-id>/tasks.json
./data/workspaces/<workspace-id>/notes.md
./data/workspaces/<workspace-id>/notebooks/index.json
./data/workspaces/<workspace-id>/notebooks/<notebook-id>.json
```

Legacy plan data still lives under:

```text
./data/plans.json
./data/study_activities.csv
./data/plans/<plan-id>/study_activities.csv
```

Other persisted app data:

```text
./data/job-applications.json
./data/chat-sessions/
./data/learning-sessions/
./data/knowledge-base.md
./data/profile.json
./data/sources.json
```

## Configuration

Default data paths:

```text
./data/workspaces.json
./data/workspaces/<workspace-id>/
./data/plans.json
./data/study_activities.csv
./data/plans/<plan-id>/study_activities.csv
./data/job-applications.json
```

Environment variables:

```text
TRACKER_CSV_PATH          Default plan CSV path
TRACKER_DATA_DIR          Plan registry and uploaded plan directory
CODEX_REVISE_COMMAND      Optional markdown-to-CSV revision command
CODEX_REVISE_TIMEOUT_MS   Optional Codex command timeout, default 120000
CODEX_CHAT_COMMAND        Optional Codex chat command override
CODEX_CHAT_TIMEOUT_MS     Optional Codex chat timeout, default 120000
CODEX_SESSION_COMMAND     Optional guided-session command override
CODEX_SESSION_TIMEOUT_MS  Optional guided-session timeout, default 120000
CODEX_PROFILE_COMMAND     Optional resume-to-background command override
CODEX_PROFILE_TIMEOUT_MS  Optional profile generation timeout, default 120000
```

## Checks

```bash
npm run typecheck
npm run build
```

## More Docs

- [Plan workflow](docs/plan-workflow.md)
- [Codex chat](docs/codex-chat.md)
- [Learning sessions](docs/learning-sessions.md)
- [Enhancements and roadmap](docs/enhancements-roadmap.md)
- [API reference](docs/api.md)
- [Product spec](docs/product-spec.md)
