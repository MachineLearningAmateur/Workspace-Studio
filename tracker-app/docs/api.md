# API Reference

## Health

```http
GET /api/health
```

Returns:

```json
{ "ok": true }
```

## Plans

```http
GET /api/plans
```

Returns the plan registry.

```http
POST /api/plans
Content-Type: application/json
```

Request body:

```json
{
  "name": "May interview sprint",
  "basePlanId": "default",
  "files": [
    {
      "filename": "may-plan.md",
      "content": "# Week 1\n- 2026-05-01 Arrays review"
    }
  ]
}
```

The response is the created plan summary.

```http
POST /api/plans/jobs
Content-Type: application/json
```

Starts plan creation in the background and returns a job snapshot.

```http
GET /api/plans/jobs/<job-id>
```

Returns job status, progress messages, and the created plan when complete.

```http
DELETE /api/plans/<plan-id>
```

Deletes an uploaded plan from the registry and removes its plan directory. The default plan cannot be deleted.

## Sources

```http
GET /api/sources
POST /api/sources
DELETE /api/sources/<source-id>
```

`POST /api/sources` accepts:

```json
{
  "filename": "notes.md",
  "content": "# Notes\n- Review arrays"
}
```

## Chat

```http
GET /api/chat/sessions
POST /api/chat/sessions
GET /api/chat/sessions/<session-id>
```

```http
POST /api/chat/jobs
```

Starts an open-ended chat turn. The backend includes recent messages from the session, selected tracker context, selected markdown sources, and the optional target date.

Request body:

```json
{
  "sessionId": "existing-session-id",
  "prompt": "Build a deadline-focused plan",
  "mode": "adaptive_progress",
  "planId": "default",
  "sourceIds": ["notes"],
  "targetDate": "2026-05-15"
}
```

Poll progress:

```http
GET /api/chat/jobs/<job-id>
```

Save a valid CSV preview:

```http
POST /api/chat/sessions/<session-id>/messages/<message-id>/save-preview
```

Create a separate plan:

```json
{ "action": "new_plan", "planName": "Adaptive sprint", "basePlanId": "default" }
```

Append rows to the selected plan:

```json
{ "action": "append_plan", "planId": "default" }
```

Replace all rows in the selected plan:

```json
{ "action": "replace_plan", "planId": "default" }
```

## Learning Sessions

```http
GET /api/learning-sessions?planId=default
POST /api/learning-sessions
GET /api/learning-sessions/<session-id>
DELETE /api/learning-sessions/<session-id>
```

Create a session from one row in the selected plan:

```json
{ "planId": "default", "rowIndex": 0 }
```

Run Codex work for a session:

```http
POST /api/learning-sessions/<session-id>/jobs
```

Request bodies:

```json
{ "type": "draft_lesson" }
```

```json
{ "type": "message", "prompt": "I think the framework is ..." }
```

```json
{ "type": "evaluation" }
```

Poll progress:

```http
GET /api/learning-sessions/jobs/<job-id>
```

Apply an evaluation to the source tracker row and knowledge base:

```http
POST /api/learning-sessions/<session-id>/apply-evaluation
```

## Knowledge Base

```http
GET /api/knowledge-base
POST /api/knowledge-base/rebuild
```

The knowledge base is stored as markdown at `./data/knowledge-base.md` and is included in future Codex chat and plan-generation context.

## Profile

```http
GET /api/profile
PUT /api/profile
POST /api/profile/generate-background
DELETE /api/profile
```

`PUT /api/profile` accepts:

```json
{
  "resume_filename": "resume.md",
  "resume_content": "# Resume text",
  "background_notes": "STAR stories, target roles, constraints, and project context"
}
```

The profile is stored at `./data/profile.json` and is included in Open Chat and Guided Sessions prompts.

`POST /api/profile/generate-background` accepts resume text and returns generated Markdown background notes:

```json
{
  "resume_filename": "resume.md",
  "resume_content": "# Resume text",
  "existing_background_notes": "optional notes to preserve"
}
```

## Tracker Rows

All tracker endpoints accept `planId`. If it is omitted, the default plan is used.

```http
GET /api/tracker?planId=default
```

Returns the rows for that plan's CSV.

```http
POST /api/tracker?planId=default
Content-Type: application/json
```

Appends one row to the selected plan CSV.

```http
PUT /api/tracker/0?planId=default
Content-Type: application/json
```

Updates row index `0` in the selected plan CSV.

```http
POST /api/tracker/reset?planId=default
```

Resets the selected plan CSV to header only.

## CSV Schema

The backend validates this exact header:

```csv
date,category,item_type,item_name,difficulty,status,time_spent_min,confidence,attempt_type,result,pattern,interview_relevance,scheduled_date,completed_at,source,notes
```

Required enum fields use lower_snake_case values. The `date` field uses `YYYY-MM-DD`; `scheduled_date` may use `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`; `completed_at` uses an ISO-like timestamp.

## Job Applications

Job applications are global and are stored separately from interview-prep plans at `./data/job-applications.json`.

```http
GET /api/job-applications
POST /api/job-applications
PUT /api/job-applications/<application-id>
PUT /api/job-applications/<application-id>/status
DELETE /api/job-applications/<application-id>
```

`POST /api/job-applications` accepts:

```json
{
  "company": "OpenAI",
  "role": "Software Engineer",
  "status": "applied",
  "date_applied": "2026-05-04",
  "job_url": "https://openai.com/careers/example",
  "location": "Remote",
  "next_follow_up_date": "2026-05-11",
  "notes": "Applied with referral and tailored resume."
}
```

`PUT /api/job-applications/<application-id>/status` accepts:

```json
{
  "status": "interview"
}
```

Allowed statuses:

- `applied`
- `recruiter_screen`
- `interview`
- `offer`
- `rejected`
- `withdrawn`
- `ghosted`

Validation:

- `company`, `role`, `status`, and `date_applied` are required
- `date_applied` and `next_follow_up_date` use `YYYY-MM-DD`
- `job_url` must be a valid `http` or `https` URL when present
