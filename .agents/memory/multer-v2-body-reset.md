---
name: multer v2 body reset bug
description: multer v2 resets req.body for non-multipart requests, wiping JSON body already parsed by Express
---

## Rule
Never add `upload.single('file')` (or any multer middleware) to a route that also needs to accept `application/json` bodies.

**Why:** multer v2.x sets `req.body = {}` for requests whose Content-Type is not `multipart/form-data`. Express's global `json()` body-parser runs first and parses JSON into `req.body`, but multer then resets it, wiping all fields. This manifests as 404/500 errors where body fields (`certificateTypeId`, etc.) are silently `undefined`.

**How to apply:** If a route must handle both JSON data and optional file uploads, use a two-step approach:
1. POST JSON to create/update the record (no multer on that route).
2. If a file is selected, make a second POST with FormData to a separate `/:id/upload` endpoint that uses `upload.single('file')`.

This pattern is used in `server/routes/complianceCertificates.ts`: `POST /api/compliance-certificates` is JSON-only; `POST /api/compliance-certificates/:id/upload` handles the file.
