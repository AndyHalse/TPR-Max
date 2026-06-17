---
name: Google AI API key proxy conflict
description: GOOGLE_API_KEY env var is Replit's proxy token; GEMINI_API_KEY is the real Google key. SDK prefers GOOGLE_API_KEY, so must unset it temporarily for direct image generation.
---

## Rule
When using GoogleGenAI SDK for IMAGE generation, must temporarily unset `GOOGLE_API_KEY` before building the client so the SDK uses `GEMINI_API_KEY` (the real AIza... key) directly.

```typescript
const saved = process.env.GOOGLE_API_KEY;
delete process.env.GOOGLE_API_KEY;
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
if (saved !== undefined) process.env.GOOGLE_API_KEY = saved;
```

**Why:** `GOOGLE_API_KEY` is Replit's internal proxy token (points to localhost model farm). GoogleGenAI SDK auto-prefers `GOOGLE_API_KEY` over an explicitly passed `apiKey` when the env var is set. The Replit proxy only supports TEXT models — image generation returns UNSUPPORTED_MODEL or 401. `GEMINI_API_KEY` (length 39, prefix AIzaSyCt) is the real Google API key with access to imagen-4.0-fast-generate-001 and gemini-2.5-flash-image.

**How to apply:** Any code that calls Gemini/Imagen for IMAGE generation (not text). Text generation should continue using AI_INTEGRATIONS_* through the proxy (those work fine).

## Working image models (confirmed via GEMINI_API_KEY direct):
- `imagen-4.0-fast-generate-001` — via `ai.models.generateImages()`, returns `imageBytes` (Buffer → base64)
- `gemini-2.5-flash-image` — via `ai.models.generateContent()` with `responseModalities: [Modality.IMAGE]`, returns `inlineData.data` (base64)

## Proxy limitations confirmed:
- `AI_INTEGRATIONS_OPENAI_BASE_URL` + gpt-image-1 → 401 org mismatch (proxy blocks image endpoint)
- `AI_INTEGRATIONS_GEMINI_BASE_URL` (localhost:1106/modelfarm/gemini) + gemini-2.0-flash-preview-image-generation → UNSUPPORTED_MODEL
