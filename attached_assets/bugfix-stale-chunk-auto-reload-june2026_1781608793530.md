# Fix: app should auto-recover after a deploy instead of throwing "Failed to fetch dynamically imported module"

## The problem (plain English)

When a user has the app open in their browser and we then deploy a new version, their open tab is still running the **old** copy of the app. Some features (like the bug-report **Download PDF** button, the Compliance Dashboard PDF, the PPM Dashboard PDF, etc.) only load their code **on demand** the moment the user clicks the button — for example:

```js
const { jsPDF } = await import("jspdf");
```

The build tool (Vite) saves that on-demand code in a file with a unique hash in the name, e.g. `jspdf.es.min-CvHjOfoa.js`. **Every new deploy changes that hash.** So when a user on yesterday's tab clicks the button, the browser asks the server for yesterday's file name — which no longer exists after the new deploy — and the server returns a 404. The user sees a red error:

> PDF generation failed — Failed to fetch dynamically imported module: https://www.tpr-max.com/assets/jspdf.es.min-CvHjOfoa.js

This is **not** a bug in the PDF feature. It happens to **any** on-demand (lazy-loaded) feature after **any** deploy, and right now the only way out is for the user to manually hard-refresh — which most customers won't know to do. As we start selling, every deploy will silently break features for anyone with the app already open.

## The fix

Add a small global handler that detects this specific "stale code after deploy" failure and **automatically reloads the page once** to pull the fresh version. A one-time guard must prevent it from reloading over and over if something else is wrong.

### 1. Create a new file: `client/src/lib/staleChunkReload.ts`

```ts
// Auto-recovers when a deploy has rotated the asset hashes and the user's
// open tab tries to lazy-load a chunk that no longer exists on the server.
// Vite fires a "vite:preloadError" event for failed dynamic imports; we also
// match the error text as a fallback for browsers/paths that don't.

let _installed = false;

const RELOAD_FLAG = "__stale_chunk_reloaded_at";
// If we already reloaded within this window, don't reload again — avoids an
// infinite loop when the failure is caused by something other than a deploy
// (e.g. the user is genuinely offline).
const RELOAD_COOLDOWN_MS = 15_000;

function looksLikeStaleChunk(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("error loading dynamically imported module") ||
    m.includes("importing a module script failed") ||
    // Safari wording
    m.includes("module script failed")
  );
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || "0");
    if (Date.now() - last < RELOAD_COOLDOWN_MS) {
      // Already tried very recently — stop, to avoid a reload loop.
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch (_) {
    // sessionStorage may be unavailable (private mode); fall through and reload.
  }
  // Reload from the server, not the cache, so we get the new index + hashes.
  window.location.reload();
}

export function installStaleChunkReload() {
  if (_installed) return;
  _installed = true;

  // Preferred signal: Vite emits this for failed dynamic imports.
  window.addEventListener("vite:preloadError", (e: any) => {
    try { e.preventDefault?.(); } catch (_) {}
    reloadOnce();
  });

  // Fallback: catch the error text from a rejected dynamic import.
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const msg = String(e?.reason?.message ?? e?.reason ?? "");
    if (looksLikeStaleChunk(msg)) reloadOnce();
  });

  window.addEventListener("error", (e: ErrorEvent) => {
    const msg = String(e?.message ?? "");
    if (looksLikeStaleChunk(msg)) reloadOnce();
  });
}
```

### 2. Install it on app start: `client/src/main.tsx`

Add the import and call it **before** the app renders, right next to the existing `installErrorBuffer()`:

```ts
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installErrorBuffer } from "./lib/errorBuffer";
import { installStaleChunkReload } from "./lib/staleChunkReload";

installErrorBuffer();
installStaleChunkReload();

createRoot(document.getElementById("root")!).render(<App />);
```

## Important guardrails

- **One reload only.** The `sessionStorage` cooldown must stop the page reloading in a loop. If after a reload the chunk *still* fails (e.g. the user is offline, or the asset is genuinely missing), it must give up and let the normal error surface — do not keep reloading.
- **Don't break the existing error reporting.** The app already has an error buffer, an ErrorBoundary and "Report a Problem". This change only adds the reload; it must not remove or interfere with that.
- **Do not change** how any feature lazy-loads (`await import(...)`). The point is to recover gracefully, not to bundle everything eagerly.

## How to test

1. Build and deploy.
2. Open the app, go to **Platform Admin → Bug Reports**, open any report.
3. In a separate step, deploy again (so the asset hashes change) **without** refreshing the open tab.
4. Click **Download PDF** on the still-open tab.
   - **Before this fix:** red "Failed to fetch dynamically imported module" error.
   - **After this fix:** the page quietly reloads once to the new version, and the PDF then downloads normally.
5. Confirm it does **not** reload repeatedly if you simulate a persistent failure (e.g. block the asset in dev tools) — it should reload at most once within the cooldown window, then stop.

## Note for the immediate live issue

The user who reported this (Emma, BR-018) is on yesterday's build. Until this fix is deployed, she can fix it right now with a hard refresh (**Ctrl + Shift + R**) or by signing out and back in.
