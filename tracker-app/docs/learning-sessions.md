# Learning Sessions

Guided Sessions in the Chat tab turn a tracker row into an interactive Codex tutoring session.

## Flow

1. Pick a task from the active plan.
2. Codex drafts a guided session with objectives, examples, checkpoints, and practice.
3. Work through the session in the transcript.
4. Ask Codex to review your understanding.
5. Approve or edit the review.
6. The app updates that tracker row and appends the assessment to `./data/knowledge-base.md`.

## Knowledge Base

Approved reviews are stored in a living markdown knowledge base. Future Codex chat requests and markdown-to-plan revisions receive this context so new plans can account for strengths, weak areas, and next focus items.

Use **Rebuild** in Guided Sessions when you want to regenerate the markdown from all approved learning-session evaluations.

## Codex Command

Learning sessions use:

```text
CODEX_SESSION_COMMAND
```

Default:

```text
codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -
```

Set this to `off` to test the UI and storage without invoking Codex:

```powershell
$env:CODEX_SESSION_COMMAND = "off"
npm run dev:server
```

The command reads the generated tutor prompt from stdin. When `{outputFile}` is present, the backend reads Codex's final message from that file.
