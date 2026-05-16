# Plan Workflow

## Main Page

Use the Active plan selector in the header to choose which curriculum CSV is loaded. All tracker actions on the page apply to that selected plan:

- loading rows
- adding activities
- editing activities
- refreshing CSV data

The default plan is backed by `TRACKER_CSV_PATH`, which defaults to:

```text
./data/study_activities.csv
```

## Plans Tab

Open Chat creates or updates curriculum plans from markdown files by returning validated CSV previews. The Plans tab manages the saved plans.

1. Enter a plan name.
2. Choose the base curriculum.
3. Select one or more `.md` files.
4. Submit the form.

The backend creates:

```text
./data/plans/<plan-id>/source-plan.md
./data/plans/<plan-id>/codex-revision-prompt.md
./data/plans/<plan-id>/study_activities.csv
```

The new plan is added to `./data/plans.json` and becomes available in the Active plan selector.

## Deleting Plans

Use Delete in the available plans list to remove an uploaded plan. Deleting a plan removes it from `./data/plans.json` and deletes that plan's directory under `./data/plans/`.

Any saved plan can be deleted from the Plans tab.

## Codex Integration

By default, the backend runs:

```text
codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -
```

Set `CODEX_REVISE_COMMAND` to override that command. Set it to `off` to skip Codex and use fallback markdown rows.
While Codex runs, Open Chat shows progress messages from the JSON event stream.

When Codex revision is enabled, the backend builds a prompt containing:

- the selected base curriculum metadata
- the current base tracker rows
- the uploaded markdown content
- the exact CSV schema and allowed enum values

The command receives that prompt on stdin. Its stdout must be a valid CSV with this header:

```csv
date,category,item_type,item_name,difficulty,status,time_spent_min,confidence,attempt_type,result,pattern,interview_relevance,scheduled_date,completed_at,source,notes
```

The `date` field is date-only. `scheduled_date` can be date-only or include local time as `YYYY-MM-DDTHH:mm`.

The backend validates the Codex output before replacing the new plan CSV.

## Fallback Behavior

If Codex is not configured or returns invalid output, the backend still creates a CSV. It extracts markdown headings and bullet-like lines into starter tracker rows with `not_started` status. The Plans table records whether Codex completed, was not configured, or failed.
