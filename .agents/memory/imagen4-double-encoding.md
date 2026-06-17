---
name: Imagen 4 imageBytes double-encoding
description: The Imagen 4 SDK returns imageBytes as an already-base64-encoded string. Buffer.from(imageBytes).toString('base64') double-encodes it.
---

## Rule
`result.generatedImages[0].image.imageBytes` from `@google/genai` is a **string** containing base64-encoded JPEG data — NOT raw bytes (Buffer/Uint8Array).

```typescript
// WRONG — produces double-encoded base64 (browser shows broken image)
const base64 = Buffer.from(imageBytes).toString('base64');

// CORRECT — use directly if string, convert only if raw bytes
const base64 = typeof imageBytes === 'string'
  ? imageBytes
  : Buffer.from(imageBytes as Uint8Array).toString('base64');
```

**Why:** The Replit token reveals the bug: `LzlqLzRB...` is the base64 of the ASCII text `/9j/4A` (JPEG header in base64). The browser decodes it once and gets the text string, not binary JPEG. Valid JPEG starts with `ffd8ff` hex.

**How to apply:** Any time you read `imageBytes` from an Imagen (imagen-4.0-*, imagen-3.0-*) API response, check its type before encoding.

**Verified:** `first bytes = ffd8ff → ✅ valid JPEG` after fix applied to `server/managers/OpenAIImageGenerator.ts` line ~76.
