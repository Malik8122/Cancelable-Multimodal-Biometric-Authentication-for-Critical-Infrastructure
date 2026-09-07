# Backend API

FastAPI REST API over `template_protection/` and `embeddings/pipelines.py`.
No frontend, no dashboard, no multimodal fusion yet - those are Phase 3
(`docs/ROADMAP.md`). Run locally with:

```bash
cp .env.example .env   # then set a real MASTER_SECRET
uvicorn backend.main:app --reload
```

Interactive docs (Swagger UI) are available at `http://127.0.0.1:8000/docs`
once running, auto-generated from the same Pydantic models documented below.

## Scope note: "auth" here means biometric verification

`backend/auth/` exists because the spec calls for an `auth/` folder, but
there is no user login, session, or token system anywhere in this project.
Every "authenticate" in this API means *does this biometric sample match
what's enrolled*, not *is this HTTP caller who they claim to be*. If this
project ever adds real API-caller authentication (e.g. an API key per
integrating application), that would be a separate, additive concern, not a
change to what's described here.

## Conventions

- All image-accepting endpoints take `multipart/form-data` with an `image`
  file field plus ordinary form fields - not JSON with a base64 image.
- `application_id` is optional on every request; omitting it falls back to
  `backend/config.py`'s `Settings.application_id` (`"capstone-demo"` by
  default).
- `modality` is one of `"face"`, `"iris"`, `"fingerprint"`.
- Only protected templates are ever persisted or returned - no endpoint
  response includes a raw image, a raw embedding, or template bytes.

## `POST /enroll`

Preprocess -> embed -> transform -> store a new protected template.

**Request** (multipart/form-data):

| Field | Type | Required | Notes |
|---|---|---|---|
| `user_id` | string | yes | External identifier, e.g. `"U001"` |
| `modality` | string | yes | `face` \| `iris` \| `fingerprint` |
| `application_id` | string | no | Defaults to `Settings.application_id` |
| `image` | file | yes | PNG/JPEG/BMP, under `Settings.max_upload_size_bytes` |

**Response** `200 OK`:

```json
{
  "success": true,
  "user_id": "U001",
  "modality": "face",
  "template_version": 1,
  "key_version": 1,
  "template_id": "1294340e-9a34-4cb9-bbb2-00c9f6259154"
}
```

Re-enrolling the same (user, modality, application) continues the existing
`key_version` sequence rather than resetting it (`backend/database/crud.py::next_key_version`).

## `POST /authenticate`

Preprocess -> embed -> transform under the *currently active* key -> compare
against the stored template.

**Request**: same shape as `/enroll` (no `template_version`/`key_version`
fields - those are server-tracked).

**Response** `200 OK`:

```json
{
  "user_id": "U001",
  "modality": "face",
  "score": 0.93,
  "threshold": 0.9,
  "authenticated": true
}
```

`score` is a Hamming similarity in `[0, 1]` (1.0 = identical templates - see
`template_protection/matcher.py`). If nothing is enrolled for this (user,
modality, application), this returns `200` with `"authenticated": false,
"score": 0.0` rather than an error - a missing enrollment and a failed match
are both "not authenticated" from a caller's point of view.

## `POST /verify/face` · `POST /verify/iris` · `POST /verify/fingerprint`

Identical to `/authenticate`, with the modality fixed by the URL instead of a
form field (so the request omits `modality`). Same response shape.

## `POST /revoke-template`

Rotate the key for (user, modality, application) and store the resulting new
template.

**Request**: same shape as `/enroll`. **A new image is required** - a
protected template cannot be "re-keyed" without the underlying embedding (see
`docs/TEMPLATE_PROTECTION.md`'s revocation workflow); there is no
image-less way to call this endpoint.

**Response** `200 OK`:

```json
{
  "success": true,
  "user_id": "U001",
  "modality": "face",
  "old_key_version": 1,
  "new_key_version": 2,
  "template_id": "6be58a97-4edf-4391-a244-aef0bfa26f79"
}
```

The previous template row is deactivated (not deleted) and will no longer be
returned by `/user/{id}` or matched against by `/authenticate`.

## `GET /user/{id}`

**Response** `200 OK`:

```json
{
  "user_id": "U001",
  "enrolled_modalities": [
    {
      "modality": "face",
      "application_id": "capstone-demo",
      "template_version": 1,
      "key_version": 1,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

`404 Not Found` if `user_id` has never been enrolled in anything.

## `DELETE /user/{id}`

Deletes the user and every protected template they own (cascading delete -
see `backend/database/models.py::User.templates`).

**Response** `200 OK`:

```json
{ "success": true, "user_id": "U001", "templates_deleted": 2 }
```

Returns `templates_deleted: 0` (still `200 OK`, not `404`) if `user_id`
doesn't exist - deleting something that's already gone is treated as
already-satisfied, not an error.

## `GET /health`

Liveness check: `{"status": "ok"}`. No auth, no dependencies touched.

## Error responses

| Status | When |
|---|---|
| `400 Bad Request` | Uploaded file isn't a decodable image |
| `404 Not Found` | `GET /user/{id}` for an unenrolled user |
| `409 Conflict` | Two concurrent `/enroll` or `/revoke-template` calls raced for the same (user, modality, application) — retry |
| `413 Request Entity Too Large` | Upload exceeds `Settings.max_upload_size_bytes` |
| `415 Unsupported Media Type` | Upload's content-type isn't in `Settings.allowed_content_types` |
| `422 Unprocessable Entity` | Unknown `modality` value, or a missing required field |

Every error body is `{"detail": "<message>"}` (FastAPI's default).

## Configuration

See `.env.example` for the full list of environment variables
(`MASTER_SECRET`, `DATABASE_URL`, `APPLICATION_ID`,
`FACE_MODEL_PATH`/`IRIS_MODEL_PATH`/`FINGERPRINT_MODEL_PATH`,
`TEMPLATE_BITS`, `MATCH_THRESHOLD`) and `backend/config.py` for what each one
does and its default. `MASTER_SECRET` has no default and must be set - the
server fails to start without it, by design.
