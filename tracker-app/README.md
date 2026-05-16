# Interview Prep Activity Tracker

A local-first React and Express app for tracking interview-prep work in CSV files. Each curriculum plan has its own CSV, and markdown uploads can create new plan-specific trackers.

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

- Keeps tracker data in CSV files, not a database.
- Starts with an empty plan registry; plans are created explicitly when needed.
- Lets the main page switch between available plans.
- Creates and revises plans through Open Chat CSV previews.
- Creates a separate CSV for every uploaded plan under `./data/plans/<plan-id>/study_activities.csv`.
- Deletes uploaded plans and their CSV files from the Plans tab.
- Adds a unified Chat tab for open Codex chat and guided learning sessions.
- Lets open chat prompt Codex with tracker progress and selected markdown sources.
- Adds a Profile tab for saved resume/background context that Codex can use for STAR and behavioral guidance.
- Adds a global Job Apps tab backed by `./data/job-applications.json`.
- Saves valid Codex CSV previews as new plans, additions to the selected plan, or replacements for the selected plan.
- Drafts guided Codex lessons from individual tracker tasks.
- Lets Codex review completed sessions, update the source tracker row, and maintain `./data/knowledge-base.md`.
- Optionally invokes Codex on the backend to revise the current curriculum into the new plan CSV.
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

## Configuration

Default data paths:

```text
./data/plans.json
./data/job-applications.json
./data/study_activities.csv
./data/plans/<plan-id>/study_activities.csv
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
