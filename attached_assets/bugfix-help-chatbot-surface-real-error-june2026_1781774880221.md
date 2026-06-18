# Bugfix: Help Assistant chatbot — show the *real* reason when it fails, instead of a mystery "couldn't reach" message (June 2026)

The in-app **Help Assistant** (the blue chat bubble, bottom-right of every page) is correctly wired to the help guide and uses the same Claude key as the Induction Builder. When it works, it answers from `server/chatbotKnowledgeBase.ts` — that part is fine and should **not** change.

The problem is what happens when it *can't* answer. Right now, every possible failure — no Claude API key, an expired or mistyped key, a key with no credits left, a rate-limit, or a genuine network drop — shows the user the **exact same** useless line: *"Sorry, I couldn't reach the help assistant just now."* The server already knows the precise reason, but both the route and the widget throw that detail away. So the feature is impossible to diagnose from the screen — you can't tell a missing key from an out-of-credits key from a server being down.

This fix makes the assistant **self-diagnosing**: it tells the user (and you) the actual reason, so a one-line message tells you whether to add a key, top up credits, or wait a moment. It also adds the missing `ANTHROPIC_API_KEY` to `.env.example` so the platform-wide fallback key is never silently absent on a future deploy.

**No database changes — you do NOT need to run `npm run db:push`.**

Copy everything below the line into the Replit agent.

---

## THE PROBLEM

Three places each drop the real error:

1. **`server/chatbotService.ts`** — the `catch` block returns one generic answer (*"Sorry, I couldn't reach the help assistant just now"*) for every kind of Claude failure. It never looks at whether the error was a bad key (401), out of credits, or a rate-limit (429).
2. **`server/routes/chatbot.ts`** — when the service fails it returns `res.json({ answer, success })` and **drops the `error` field**, so even a caller who wanted the reason can't see it.
3. **`client/src/components/ChatbotWidget.tsx`** — the `catch` is a bare `catch {` that ignores the error completely and always shows its own hard-coded generic line. The thrown error already carries the server's real message on `err.message` (see `throwIfResNotOk` in `client/src/lib/queryClient.ts`, which sets the message from the server's `error` field) — the widget just never reads it.

The net effect: the server's helpful 503 message *"Help assistant requires a Claude API key. Please add one in Settings → AI."* never reaches the user.

## THE FIXES

### 1. `server/chatbotService.ts` — map common Claude errors to a clear, honest answer

In the `catch (error: unknown)` block of `askHelpAssistant`, before returning, inspect the error and pick a specific, plain-English message. The Anthropic SDK error exposes a numeric `.status` and a `.message`.

Replace the existing `catch` body with logic along these lines (keep British English, keep it short, keep the existing `logger.error` line):

```ts
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as any)?.status as number | undefined;
    const lower = msg.toLowerCase();

    logger.error("❌ chatbotService.askHelpAssistant error:", msg);

    let answer = "Sorry, I couldn't reach the help assistant just now — please try again in a moment.";

    if (status === 401 || lower.includes("authentication") || lower.includes("invalid x-api-key") || lower.includes("invalid api key")) {
      answer = "The Claude API key saved in Settings → AI looks invalid or expired. Please check or re-enter it, then try again.";
    } else if (lower.includes("credit balance") || lower.includes("insufficient") || lower.includes("billing")) {
      answer = "The Claude account has run out of credits. Please top up the Claude API key (Settings → AI), then try again.";
    } else if (status === 429 || lower.includes("rate limit")) {
      answer = "The help assistant is busy right now (rate limit reached). Please wait a moment and try again.";
    }

    return { answer, success: false, error: msg };
  }
```

Leave the success path and the empty-response path exactly as they are.

### 2. `server/routes/chatbot.ts` — stop dropping the error, and let the real reason through

**a)** The no-key 503 already returns a good message — leave it.

**b)** Where the route currently does:

```ts
const { answer, success } = await askHelpAssistant({ ... });
return res.json({ answer, success });
```

…it discards the service's `error`. That's fine for the user-facing `answer` (which is now specific), so the only required change here is to make sure the **specific `answer` from the service is what gets returned** — which it already does. No change needed to the happy path.

**c)** Confirm the catch-all at the bottom still returns its `{ error: '...' }` JSON (it does) — the widget change below will now surface it.

*(In short: the service change in step 1 does the heavy lifting; the route already passes `answer` through. Don't over-engineer this file.)*

### 3. `client/src/components/ChatbotWidget.tsx` — read the real error instead of ignoring it

Change the bare `catch {` in `sendMessage` so it reads the server's message. The thrown error carries the server's `error` text on `err.message` (and `err.status` is set when the server responded). Distinguish a real server response from a true network drop:

```ts
    } catch (err: any) {
      const serverSaid = err?.status && typeof err?.message === "string" ? err.message : null;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            serverSaid ||
            "Sorry, I couldn't reach the help assistant just now — please try again in a moment.",
        },
      ]);
      setHasError(true);
    } finally {
```

So: if the server replied with a reason (e.g. the 503 *"Help assistant requires a Claude API key…"*), show that. Only fall back to the generic line for a genuine can't-reach-the-server network failure.

### 4. `.env.example` — document the platform-wide Claude key

Add this block (the chatbot and other AI features fall back to it when a customer has no per-account Claude key saved):

```
# Anthropic Claude API key — powers the in-app Help Assistant and other AI
# features as a platform-wide fallback when a customer hasn't saved their own
# key in Settings → AI. Get one from https://console.anthropic.com/
ANTHROPIC_API_KEY=
```

## ACCEPTANCE — how to know it worked

- With **no Claude key** anywhere, the chat bubble now replies *"Help assistant requires a Claude API key…"* (not the generic line).
- With an **invalid/expired key**, it replies that the key looks invalid or expired.
- With a **valid key**, it answers normally from the help guide — unchanged behaviour.
- Stopping the server mid-request still shows the generic "couldn't reach" line (correct — that's a real network failure).
- No schema change; `npm run check` passes; **no `db:push` needed.**
