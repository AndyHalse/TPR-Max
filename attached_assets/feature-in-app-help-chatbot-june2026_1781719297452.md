# Feature — In-App Help Assistant (Chatbot) for TPR

**Date:** 17 June 2026
**Type:** New feature
**Status:** Not yet built

---

## What we're building, in one sentence

A small chat bubble that sits in the bottom-right of every logged-in page of TPR and answers "how do I…" questions about **using the product** — e.g. "how do I add a contractor?", "where's the muster report?", "how do I set up an induction?". It is a **help assistant only**. It knows how TPR works; it never reads, queries, or reveals any customer's actual data.

This is deliberately the lowest-risk version of a chatbot. It does not touch tenant data, so it cannot leak across customers. A future phase may add a data-aware assistant, but that is **out of scope here** and must not be built into this feature.

---

## Hard rules (non-negotiable)

1. **No customer data, ever.** The assistant must never call the database, never read tenant records, and never answer questions about a specific customer's data ("who's on site?", "which contractors are non-compliant?", "show me today's check-ins"). When asked anything data-specific, it politely declines and explains it can only help with how to *use* TPR, then points the user to the right page.
2. **Grounded answers only.** The assistant answers from the supplied knowledge base (see below). If the answer isn't in the knowledge base, it must say it doesn't know rather than invent steps, menu names, or features. No hallucinated buttons.
3. **Never shown on emergency or kiosk screens.** The bubble must be hidden on the muster/evacuation, emergency, and self-service kiosk/check-in routes. This follows the existing house rule about not cluttering life-safety and kiosk screens. (If unsure which routes these are, ask before guessing — likely candidates include the emergency/muster pages and any public check-in/kiosk view.)
4. **British English, plain language, warm but direct.** Match the tone of the rest of TPR. British spelling throughout (colour, organise, etc.).

---

## How it works (architecture)

Reuse the **existing Claude integration pattern** already in the codebase — do not add a new AI provider or a vector database.

- The codebase already uses `@anthropic-ai/sdk` (see `server/claudeService.ts` for the canonical pattern: build an `Anthropic` client, call `anthropic.messages.create(...)`, read `message.content[0].text`).
- The platform Claude key is `process.env.ANTHROPIC_API_KEY`. Use that as the default. If a customer has stored their own Claude key (the AI-keys mechanism in `server/routes/settings.ts`), you may use that instead, but the platform key is the expected default for the help bot since the help content is identical for every customer.
- **Knowledge approach = Option A (prompt-embedded).** The entire curated help guide is placed in the system prompt on every request. No embeddings, no search index, no extra tables. The help content is small enough to fit comfortably in context, and this keeps the build simple and easy to maintain.

### Model

Use **`claude-sonnet-4-6`**. It is already configured in `server/managers/AiModelManager.ts` (`claudeModelConfigs`), it's fast and inexpensive — the right choice for a high-volume help bot. (If Andy later wants maximum answer quality over cost, the model string is the only thing that needs to change — keep it in one constant so it's a one-line swap.)

---

## Backend

### 1. New file: `server/chatbotKnowledgeBase.ts`

Export a single string constant `HELP_KNOWLEDGE_BASE` containing the curated help guide, organised by module. **Generate the first draft from the actual codebase** — walk the live pages/modules and write a short, plain-English "how do I…" section for each. Cover at least these modules (all confirmed to exist in TPR):

- Visitors / check-in & check-out, passes
- Staff management, staff photos, QR ID cards
- Contractors: adding a contractor, requesting documents, the contractor portal, approval/compliance gating
- Inductions: building an induction, AI induction generation, induction settings
- Mustering / evacuation (how to *set up and use* it — not live data)
- Members page
- PPM (planned preventative maintenance) — assets, work orders, service certificates
- Permit to Work
- Risk Assessment (RA) Builder & RAMS
- Audits & Inspections
- Fire Risk Assessment
- Martyn's Law
- H&S Incidents (RIDDOR)
- Compliance Certificates register and Compliance Dashboard
- Meeting Rooms
- Equipment Register, Worker DBS, Worker Certs, Templates Library
- Reports, Analytics
- Settings: company branding/logo, AI keys, integrations (Teams, Calendar)
- Reporting a problem / raising a bug

For each: a one-line "what it's for" and the key steps a user takes ("To add a contractor: go to **Contractors** → **Add Contractor** → …"). Keep it concise. Add a comment at the top of the file noting it must be kept in step with the product when features change.

### 2. New file: `server/chatbotService.ts`

Mirror the structure of `server/claudeService.ts`. Export one function, e.g.:

```ts
export async function askHelpAssistant(params: {
  messages: { role: "user" | "assistant"; content: string }[];
  currentPage?: string;   // e.g. "Contractors" — optional context from the client
  apiKey: string;
}): Promise<{ answer: string; success: boolean; error?: string }>
```

- Build the `Anthropic` client from `apiKey`.
- Call `anthropic.messages.create` with:
  - `model`: the `claude-sonnet-4-6` constant
  - `max_tokens`: ~1024 (help answers are short)
  - `system`: the persona + `HELP_KNOWLEDGE_BASE` + the guardrails (see system prompt below)
  - `messages`: the conversation history passed in (cap it — keep only the last ~10 turns to bound cost)
- Read `message.content[0]` and guard `type === "text"` exactly like `claudeService.ts`.
- Wrap in try/catch, log via the existing `logger`, and return a friendly fallback string on error ("Sorry, I couldn't reach the help assistant just now — please try again in a moment.").

**System prompt** (embed this persona, then the knowledge base):

> You are the TPR Help Assistant. TPR is a visitor, contractor and staff management platform with compliance, mustering and health-&-safety modules. You help users understand **how to use TPR**. Use British English, plain language, and a warm but direct tone.
>
> Rules you must always follow:
> - Only answer questions about how to use TPR, using the help guide below. If the answer isn't in the guide, say you're not sure and suggest the user use "Report a Problem" so the team can help — do not invent steps or features.
> - You have **no access to any customer's data**. If asked about specific records (who is on site, which contractors are compliant, today's visitors, etc.), explain that you can't see live data and point the user to the page where they can view it themselves.
> - Keep answers short and step-by-step. Reference page and button names from the guide.
>
> [HELP_KNOWLEDGE_BASE inserted here]

If a `currentPage` is supplied, add a line to the system prompt like: "The user is currently on the **{currentPage}** page — prefer help relevant to that page when it makes sense."

### 3. New route file: `server/routes/chatbot.ts`

- Export `registerChatbotRoutes(app)` following the same shape as the other route modules.
- Register it in `server/routes/index.ts` alongside the others (add the import and the `registerChatbotRoutes(app)` call).
- Endpoint: `app.post("/api/chatbot/ask", requireAuth, handler)`.
  - Require auth (logged-in users only). `req.customerId` and `req.user!.username` are available — use them only for rate-limiting/logging, **never** to fetch data for the answer.
  - Validate the body: `messages` must be a non-empty array of `{role, content}` with sensible length limits (reject overly long inputs — cap each message to e.g. 2,000 chars and the array to ~10 items).
  - Resolve the API key: platform `ANTHROPIC_API_KEY` by default.
  - Call `askHelpAssistant(...)` and return `{ answer }`.
  - **Rate limit** per user/customer (reuse whatever simple rate-limiting approach already exists in the codebase, e.g. the contractor-portal rate limiter pattern) so the help bot can't be abused to burn Claude credits.
- Do **not** log full message contents in a way that mixes tenants; if logging questions for later KB improvement, log them clearly scoped and avoid storing anything sensitive.

### 4. "When it doesn't know" → feed the help backlog (nice-to-have, keep simple)

When the assistant says it doesn't know, the client should offer a one-click "Report this" that routes into the **existing Report-a-Problem / bug reporting** flow, pre-filled as a help request. This turns unanswered questions into a to-do list for improving the knowledge base. If wiring this cleanly is non-trivial, ship the chatbot first and leave a clearly-marked TODO — do not block the core feature on it.

---

## Frontend

### New component: `client/src/components/ChatbotWidget.tsx`

- A floating bubble button, bottom-right, fixed position, above page content. Use the existing design system / Tailwind tokens and ACS brand colour (`#2460A9`) for consistency. **Do not use glassmorphism** on this widget if it would ever appear over a kiosk/emergency screen — but per the hard rules it won't appear there at all.
- Clicking opens a small chat panel: scrollable message list, a text input, send button, and a clear "Help Assistant" heading with a one-line "I can help with how to use TPR. I can't see your data." subtitle so expectations are set.
- Maintain conversation state in the component. On send, POST to `/api/chatbot/ask` with the message history and the current page name (derive from the router/route).
- Use the app's existing API client (the one that attaches the per-tab auth token — match how other authenticated calls are made; do **not** use raw `fetch` without the auth header).
- Show a typing/loading indicator while waiting. Render the assistant's reply as plain text (or light markdown if the app already has a markdown renderer).
- Handle errors gracefully with the friendly fallback message.

### Mount + route exclusion

- Mount `<ChatbotWidget />` once in `client/src/App.tsx` (or the main authenticated layout), so it appears on all logged-in pages.
- **Hide it** on the emergency/muster, and kiosk/self-service check-in routes (and the login/public pages). Implement as a route-path check that returns `null` for those paths.

---

## Acceptance criteria

1. A logged-in user sees a help bubble bottom-right on normal pages; it is **absent** on emergency/muster, kiosk/check-in, and login/public pages.
2. Asking "How do I add a contractor?" returns correct, concise steps drawn from the knowledge base.
3. Asking "Who is on site right now?" (or any data question) makes the assistant politely decline and point to the relevant page — it never returns real data.
4. Asking about something not in the guide makes the assistant admit it doesn't know (no invented steps) and offer to report it.
5. The endpoint requires authentication, is rate-limited, and uses `claude-sonnet-4-6` via the platform `ANTHROPIC_API_KEY`.
6. No new database tables, no vector store, no second AI provider. `npm run check` passes.

---

## Out of scope (do not build)

- Any data-aware answering (querying tenant records).
- Embeddings / RAG / a separate search index.
- Showing the bot on emergency or kiosk screens.
- Multi-language support.
