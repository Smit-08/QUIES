# Quies — API Contract

**Version 1.0 — Draft for team review**
**Scope:** App ↔ Backend (public API) and Backend ↔ AI Service (internal API)
**Owners:** Smit (Backend, primary maintainer) · Vedant (AI Service) · Rohan (consumer/frontend)

This document is the single source of truth for endpoint shapes. The Postman collection Smit publishes should mirror this exactly — if they ever disagree, this document wins until both are updated together. Any change to a request/response shape gets flagged in the group chat before merging, same as adding a dependency.

---

## 1. Conventions

These apply to every endpoint in this document unless an individual endpoint says otherwise.

| Convention | Rule |
| --- | --- |
| Base URL (App → Backend) | `https://<backend-service>.onrender.com` (staging/prod URL TBD at deploy time) |
| Base URL (Backend → AI Service) | `http://ai-service:8000` internally via Docker Compose locally; internal Render/Railway URL in deployment — never exposed to the app |
| Content-Type | `application/json` for all requests and responses, except file upload on Evidence Vault (`multipart/form-data`) |
| IDs | UUID v4 strings everywhere (`user_id`, `job_id`, `evidence_id`, etc.) |
| Timestamps | ISO 8601, UTC, e.g. `2026-06-21T14:32:00Z` |
| Auth (App → Backend) | Firebase ID token in `Authorization: Bearer <token>` header. Backend verifies via Firebase Admin SDK middleware on every protected route. |
| Auth (Backend → AI Service) | Internal shared secret in `X-Internal-Key` header. The AI service rejects any request without it. This key lives in `.env`, never in code or the repo. |
| Success envelope | `{ "success": true, "data": { ... } }` |
| Error envelope | `{ "success": false, "error": { "code": "STRING_CODE", "message": "human-readable", "details": {} } }` |
| Pagination (list endpoints) | Query params `?page=1&limit=20`; response includes `data.items[]` and `data.pagination: { page, limit, total }` |

---

## 2. The Async Job Pattern

Scan, chat, evidence processing, and report generation are all slow operations (model inference, Claude calls, blockchain writes), so they all follow the same submit-then-poll shape described in the workflow doc:

1. App `POST`s to a trigger endpoint (e.g. `/api/scan`).
2. Backend validates the request, writes a `jobs` row, kicks off async work, and immediately returns a `job_id`.
3. App polls `GET /api/jobs/:job_id` every 3 seconds.
4. Backend returns job status; once `status` is `complete` or `failed`, the app stops polling and renders the result (or error).

### Job status values

| Status | Meaning |
| --- | --- |
| `queued` | Job row created, not yet picked up |
| `processing` | Backend has called the AI service (or blockchain) and is waiting on it |
| `complete` | `result` is populated, safe to render |
| `failed` | `error` is populated, no `result` |

### `GET /api/jobs/:job_id`

**Auth:** required. Backend must confirm the job's `user_id` matches the authenticated user — return `404` (not `403`) if it doesn't, to avoid leaking job existence.

**Response — in progress**
```json
{
  "success": true,
  "data": {
    "job_id": "f3a1...",
    "type": "scan",
    "status": "processing",
    "created_at": "2026-06-21T14:32:00Z",
    "result": null,
    "error": null
  }
}
```

**Response — complete** (`result` shape depends on `type` — see each trigger endpoint below for its specific schema)
```json
{
  "success": true,
  "data": {
    "job_id": "f3a1...",
    "type": "scan",
    "status": "complete",
    "created_at": "2026-06-21T14:32:00Z",
    "completed_at": "2026-06-21T14:32:18Z",
    "result": { },
    "error": null
  }
}
```

**Response — failed**
```json
{
  "success": true,
  "data": {
    "job_id": "f3a1...",
    "type": "scan",
    "status": "failed",
    "result": null,
    "error": { "code": "AI_SERVICE_TIMEOUT", "message": "AI service did not respond in time" }
  }
}
```

`type` is one of: `scan`, `chat`, `evidence`, `report`.

---

## 3. Data Models

These match the Prisma schema Smit owns. The `jobs` table is added here since the workflow doc references `job_id` everywhere but the table list didn't include one — flag this addition in the group chat so the schema actually gets created.

### `users`
| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | primary key |
| firebase_uid | string | links to Firebase Auth identity; replaces a locally-stored password hash since auth is delegated to Firebase |
| email | string | synced from Firebase on first login |
| created_at | timestamp | |

### `devices`
| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | primary key |
| user_id | UUID | foreign key → users |
| scan_results | JSON | latest raw scanner output |
| last_scanned_at | timestamp | |

### `jobs` *(proposed addition)*
| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | primary key, this is the `job_id` |
| user_id | UUID | foreign key → users |
| type | string | `scan` \| `chat` \| `evidence` \| `report` |
| status | string | `queued` \| `processing` \| `complete` \| `failed` |
| input | JSON | original request payload, for debugging/retries |
| result | JSON, nullable | populated on completion |
| error | JSON, nullable | populated on failure |
| created_at | timestamp | |
| completed_at | timestamp, nullable | |

### `evidence`
| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | primary key |
| user_id | UUID | foreign key → users |
| type | string | e.g. `screenshot`, `scan_report`, `audio`, `document` |
| file_ref | string | path in Supabase Storage |
| hash | string | SHA-256 of the stored file |
| blockchain_tx_id | string, nullable | null until the Sepolia transaction confirms |
| created_at | timestamp | |

### `risk_scores`
| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | primary key |
| user_id | UUID | foreign key → users |
| score | number | 0–100 |
| factors | JSON | feature breakdown driving the score, for the UI to explain "why" |
| created_at | timestamp | |

---

## 4. App ↔ Backend — Public API

Everything below is what Rohan's Axios instance calls. The app never talks to the AI service or the blockchain directly — always through these routes.

### 4.1 Auth

#### `POST /api/auth/sync`
Called once right after Firebase login succeeds on the app, so the backend has a local `users` row to attach devices, evidence, and scores to.

**Auth:** required (Firebase ID token)

**Request:** empty body — all identity info comes from the verified token.

**Response**
```json
{
  "success": true,
  "data": {
    "user_id": "b7e2...",
    "email": "user@example.com",
    "created_at": "2026-06-21T10:00:00Z"
  }
}
```

### 4.2 Scan

#### `POST /api/scan`
Triggers a spyware/stalkerware scan and the risk-score recompute that follows it.

**Auth:** required

**Request**
```json
{
  "device_info": {
    "platform": "android",
    "os_version": "14",
    "installed_apps": [
      { "package_name": "com.example.app", "permissions": ["CAMERA", "LOCATION"] }
    ],
    "background_processes": ["com.example.tracker"]
  }
}
```

**Response (202 Accepted)**
```json
{
  "success": true,
  "data": { "job_id": "f3a1...", "status": "queued" }
}
```

**`GET /api/jobs/:job_id` result shape when `type: "scan"`**
```json
{
  "scan": {
    "flagged_apps": [
      { "package_name": "com.example.tracker", "risk_level": "high", "reasons": ["hidden icon", "background location access"] }
    ],
    "device_id": "d4c9..."
  },
  "risk_score": { "score": 78, "factors": { "hidden_apps": 30, "permission_abuse": 28, "breach_history": 20 } }
}
```

#### `GET /api/risk-score`
Returns the most recent risk score for the authenticated user (no scan trigger — just a read).

**Auth:** required

**Response**
```json
{
  "success": true,
  "data": { "score": 78, "factors": { "hidden_apps": 30, "permission_abuse": 28, "breach_history": 20 }, "created_at": "2026-06-21T14:32:18Z" }
}
```

#### `GET /api/history`
Returns past scans and risk scores, newest first, paginated.

**Auth:** required

**Response**
```json
{
  "success": true,
  "data": {
    "items": [
      { "type": "scan", "job_id": "f3a1...", "created_at": "2026-06-21T14:32:18Z", "summary": { "score": 78, "flagged_count": 2 } }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 5 }
  }
}
```

### 4.3 Safety Assistant Chat

#### `POST /api/chat`
**Auth:** required

**Request**
```json
{
  "message": "I think someone installed something on my phone, what should I check first?",
  "conversation_id": "c8a4..."
}
```
`conversation_id` is optional — omit it to start a new conversation; the backend generates and returns one.

**Response (202 Accepted)**
```json
{
  "success": true,
  "data": { "job_id": "a9d2...", "conversation_id": "c8a4...", "status": "queued" }
}
```

**`GET /api/jobs/:job_id` result shape when `type: "chat"`**
```json
{
  "reply": "Start by checking installed apps for anything you don't recognize...",
  "conversation_id": "c8a4..."
}
```

### 4.4 Evidence Vault

#### `POST /api/evidence`
Uploads a piece of evidence (screenshot, scan report, etc.), stores it in Supabase Storage, hashes it, and writes the hash to the Sepolia evidence-ledger contract. The blockchain write is why this is also job-based — confirmation isn't instant.

**Auth:** required
**Content-Type:** `multipart/form-data`

**Request fields**
| Field | Type | Notes |
| --- | --- | --- |
| file | binary | the evidence file |
| type | string | `screenshot` \| `scan_report` \| `audio` \| `document` |

**Response (202 Accepted)**
```json
{
  "success": true,
  "data": { "job_id": "e1b7...", "status": "queued" }
}
```

**`GET /api/jobs/:job_id` result shape when `type: "evidence"`**
```json
{
  "evidence_id": "ev01...",
  "type": "screenshot",
  "hash": "sha256:9f86d0...",
  "blockchain_tx_id": "0x4f2a..."
}
```

#### `GET /api/evidence`
Lists the authenticated user's evidence items, paginated.

**Auth:** required

**Response**
```json
{
  "success": true,
  "data": {
    "items": [
      { "evidence_id": "ev01...", "type": "screenshot", "hash": "sha256:9f86d0...", "blockchain_tx_id": "0x4f2a...", "created_at": "2026-06-21T15:00:00Z" }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 3 }
  }
}
```

#### `GET /api/evidence/:evidence_id`
Returns a single evidence record, including a short-lived signed URL to the file.

**Auth:** required (must own the evidence record — `404` otherwise)

**Response**
```json
{
  "success": true,
  "data": {
    "evidence_id": "ev01...",
    "type": "screenshot",
    "hash": "sha256:9f86d0...",
    "blockchain_tx_id": "0x4f2a...",
    "file_url": "https://...supabase.co/...&token=...",
    "created_at": "2026-06-21T15:00:00Z"
  }
}
```

### 4.5 Legal Report Generator

#### `POST /api/report`
Generates a formatted legal/evidence report via Claude, pulling together the user's scans, risk scores, and evidence.

**Auth:** required

**Request**
```json
{
  "evidence_ids": ["ev01...", "ev02..."],
  "include_scan_history": true
}
```

**Response (202 Accepted)**
```json
{
  "success": true,
  "data": { "job_id": "r5k8...", "status": "queued" }
}
```

**`GET /api/jobs/:job_id` result shape when `type: "report"`**
```json
{
  "report_text": "On [date], the device associated with this account showed...",
  "evidence_ids": ["ev01...", "ev02..."],
  "generated_at": "2026-06-21T16:00:00Z"
}
```

---

## 5. Backend ↔ AI Service — Internal API

These are the FastAPI endpoints Vedant owns. The backend calls these synchronously from inside whatever job-runner picks up the queued job; the app never sees this layer. All requests require `X-Internal-Key`.

### 5.1 `POST /ai/scan-analysis`
Runs the spyware/stalkerware behavior-detection model over a device's app list and background processes.

**Request**
```json
{
  "device_info": {
    "platform": "android",
    "installed_apps": [{ "package_name": "com.example.app", "permissions": ["CAMERA", "LOCATION"] }],
    "background_processes": ["com.example.tracker"]
  }
}
```

**Response**
```json
{
  "flagged_apps": [
    { "package_name": "com.example.tracker", "risk_level": "high", "reasons": ["hidden icon", "background location access"] }
  ]
}
```

### 5.2 `POST /ai/risk-score`
Runs the risk-score model over scan output plus historical behavior/breach data.

**Request**
```json
{
  "scan_result": { "flagged_apps": [ ] },
  "breach_check": { "breached": true, "breach_count": 2 }
}
```

**Response**
```json
{
  "score": 78,
  "factors": { "hidden_apps": 30, "permission_abuse": 28, "breach_history": 20 }
}
```

### 5.3 `POST /ai/assistant`
Calls Claude for the Safety Assistant chat.

**Request**
```json
{
  "message": "I think someone installed something on my phone, what should I check first?",
  "conversation_history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response**
```json
{
  "reply": "Start by checking installed apps for anything you don't recognize..."
}
```

### 5.4 `POST /ai/report`
Calls Claude for the Legal Report Generator.

**Request**
```json
{
  "evidence": [
    { "type": "screenshot", "hash": "sha256:9f86d0...", "created_at": "2026-06-21T15:00:00Z" }
  ],
  "scan_history": [ { "score": 78, "created_at": "2026-06-21T14:32:18Z" } ]
}
```

**Response**
```json
{
  "report_text": "On [date], the device associated with this account showed..."
}
```

> **Note for Vedant:** these four response shapes are exactly what Smit's backend expects back — lock them before writing prompts, since the backend, the job `result` field, and the app's rendering all depend on this shape staying stable. If a field needs to change, flag it in the group chat first, same as a new dependency.

---

## 6. Error Codes

| Code | HTTP Status | Meaning |
| --- | --- | --- |
| `AUTH_INVALID_TOKEN` | 401 | Firebase token missing, expired, or invalid |
| `AUTH_FORBIDDEN` | 403 | Valid token, but not allowed to access this resource |
| `VALIDATION_ERROR` | 400 | Request body failed validation — `details` includes the offending field(s) |
| `NOT_FOUND` | 404 | Resource doesn't exist or doesn't belong to this user |
| `JOB_NOT_FOUND` | 404 | `job_id` doesn't exist or belongs to another user |
| `AI_SERVICE_UNAVAILABLE` | 502 | Backend couldn't reach the AI service |
| `AI_SERVICE_TIMEOUT` | 504 | AI service didn't respond within the timeout window |
| `BLOCKCHAIN_WRITE_FAILED` | 502 | Evidence hash write to Sepolia failed (job still marked `failed`, evidence row is kept with `blockchain_tx_id: null` for retry) |
| `RATE_LIMITED` | 429 | Too many requests in a short window |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

---

## 7. HTTP Status Code Summary

| Status | When |
| --- | --- |
| 200 | Successful `GET`/read |
| 202 | Job accepted, processing async (`POST /api/scan`, `/api/chat`, `/api/evidence`, `/api/report`) |
| 400 | Validation error |
| 401 | Missing/invalid auth |
| 403 | Authenticated but not authorized for this resource |
| 404 | Resource not found |
| 429 | Rate limited |
| 500/502/504 | Server-side or upstream failure |

---

## 8. Open Items for the Team to Confirm

- **`jobs` table:** added here since it's load-bearing for the entire polling pattern but wasn't in the original table list — Smit, please confirm and add to the Prisma schema.
- **Internal auth header for the AI service:** `X-Internal-Key` is a placeholder name/mechanism — Vedant, confirm this matches however Docker Compose and the deployed Render/Railway services actually pass secrets between them.
- **Conversation history storage for chat:** schema above assumes `conversation_id` groups messages, but no `chat_messages` table exists yet — needs a quick design decision (own table vs. JSON blob on `jobs.input`).
- **Evidence/report endpoints (4.4, 4.5) and their AI-service counterparts (5.1–5.4 beyond assistant/report):** the workflow doc explicitly named `/ai/assistant` and `/ai/report`; the scan-analysis and risk-score split (5.1, 5.2) is inferred from "runs the spyware-behavior model, the risk-score model" — confirm Smit's models are actually exposed as two separate calls rather than one combined one.

Once these are confirmed, mirror this contract into the Postman collection and treat that as the day-to-day reference — this document stays the canonical record of *why* the shapes are what they are.
