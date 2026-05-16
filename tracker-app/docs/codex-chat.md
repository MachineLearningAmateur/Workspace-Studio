# Codex Chat

The Chat tab contains Open Chat and Guided Sessions. Open Chat is an open-ended Codex session that can use tracker progress and markdown sources when they are relevant. Codex can answer normally, draft markdown notes, outline lightweight plans, or generate a saveable tracker CSV when explicitly asked.

## Sources

Markdown sources are global and reusable. The backend stores metadata in:

```text
./data/sources.json
```

and file contents under:

```text
./data/sources/<source-id>.md
```

Open Chat can upload, select, and delete sources. Only selected sources are included in a Codex prompt.

## Sessions

Chat sessions persist under:

```text
./data/chat-sessions/
```

Each message stores the role, content, selected sources, selected plan, target date, and optional CSV preview. The backend includes recent session history in future prompts so follow-up requests can continue the conversation.

## Adaptive Planning

Use `Use progress for plan` when Codex should review the selected plan's progress history before generating or revising a plan. The backend includes completed rows and weak signals:

- `done`
- `review_again`
- `skipped`
- confidence from `1` to `2`
- `solved_with_hint`
- `needed_solution`

The optional target date tells Codex to optimize for interview readiness by that date.

## CSV Preview

When Codex returns a fenced `csv` block, the backend validates it against the tracker schema. Valid previews can be saved as a new plan, appended to the selected plan, or used to replace the selected plan. Invalid previews show validation errors and cannot be saved. Normal markdown responses do not create previews.
