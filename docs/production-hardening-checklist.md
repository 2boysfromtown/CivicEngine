# CivicEngine Production Hardening Checklist

This checklist captures the fixes required before positioning CivicEngine as a production municipal system. The current repository is strong as a hackathon MVP, but these items should be completed before a real pilot or public civic deployment.

## P0: Must fix before any public pilot

### 1. Disable local/mock auth in production

Current behavior allows the server to fall back to local in-memory mode when Firebase Admin is not configured or fails to initialize. That is useful for demos, but production must fail closed.

Required behavior:

- If `NODE_ENV=production` and `FIREBASE_PROJECT_ID` is missing, crash on startup.
- If `NODE_ENV=production` and Firebase Admin initialization fails, crash on startup.
- Never accept `mock_token_citizen` or `mock_token_authority` in production.

Suggested implementation shape:

```ts
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.FIREBASE_PROJECT_ID) {
  if (isProduction) throw new Error('FIREBASE_PROJECT_ID is required in production');
  console.warn('FIREBASE_PROJECT_ID not set; running local demo mode');
  return;
}
```

### 2. Make evidence files private by default

Citizen photos and audio can expose faces, home locations, vehicle plates, and voice identity. Do not upload evidence with public access.

Required behavior:

- Store uploaded evidence in a private bucket path.
- Return internal storage references to the API, not public URLs.
- Serve media only after checking requester role and ownership.
- Use signed URLs with short expiry only when required.
- Define retention rules for evidence deletion after closure or legal expiry.

### 3. Remove fake coordinate fallback

Invalid or missing coordinates currently fall back to demo coordinates. In a civic system, this can create false ward assignment and bad hotspot data.

Required behavior:

- If GPS is missing, mark `locationStatus: 'UNVERIFIED'`.
- Ask user for landmark or manual ward confirmation.
- Do not assign a real ward from fallback demo coordinates.
- Exclude unverified reports from hotspot analytics until confirmed.

### 4. Replace in-memory AI queue with durable queue

The in-memory `aiQueue` is fine for a demo, but it is not durable or horizontally scalable.

Required options:

- Google Cloud Tasks
- Google Pub/Sub
- Firestore queue documents with lease/lock fields
- Redis/BullMQ

Minimum queue guarantees:

- Persist jobs before returning success.
- Retry with exponential backoff.
- Mark final failure with clear `aiStatus` and reason.
- Prevent duplicate processing across multiple app instances.
- Expose queue metrics in logs or dashboard.

## P1: Required for credibility

### 5. Add request schema validation

Use Zod or a similar validator for API request bodies and query params.

Targets:

- `/api/process-civic-report`
- `/api/issues`
- `/api/issues/:id/status`
- `/api/projects`
- `/api/projects/:id/vote`
- `/api/projects/:id/feedback`
- `/api/analyze-ward`

### 6. Add Firestore security rules and indexes

The repo should include deployable infrastructure files:

- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`
- Firebase deployment notes

### 7. Split `server.ts`

Recommended structure:

```txt
server/
  app.ts
  auth/
  routes/
  services/
    aiTriageService.ts
    issueService.ts
    projectService.ts
    queueService.ts
    storageService.ts
    wardDetectionService.ts
  validators/
  prompts/
```

### 8. Add test coverage beyond the happy path

Current E2E test verifies a core happy path. Add tests for:

- Unauthorized authority endpoints
- Invalid GPS
- Oversized files
- Wrong MIME type
- Duplicate detection merge behavior
- Spam rejection
- Status transition validation
- Project vote toggling
- CSV export authorization

## P2: Pilot readiness

### 9. Add measurable evaluation

Do not claim exact impact numbers without measurement. Track:

- Duplicate detection precision/recall
- Median report creation latency
- AI triage completion latency
- Transcription quality by language
- Spam false positive rate
- Ward detection confidence
- Officer response time

### 10. Add observability

Add structured logs and metrics for:

- API failures
- Queue retries and final failures
- AI quota/rate-limit events
- Auth failures
- Storage access attempts
- WebSocket session close reasons

## Current safe fixes in this branch

- Added CI workflow for typecheck and production build.
- Added explicit `typecheck`, `test:e2e`, and `ci` scripts.
- Renamed package from generic `react-example` to `civicengine`.
- Updated README language to avoid unverified impact claims.
