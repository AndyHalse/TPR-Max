let _installed = false;

const RELOAD_FLAG = "__stale_chunk_reloaded_at";
const RELOAD_COOLDOWN_MS = 15_000;

function looksLikeStaleChunk(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("error loading dynamically imported module") ||
    m.includes("importing a module script failed") ||
    m.includes("module script failed")
  );
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || "0");
    if (Date.now() - last < RELOAD_COOLDOWN_MS) {
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch (_) {
    // sessionStorage unavailable (private mode) — fall through and reload.
  }
  window.location.reload();
}

export function installStaleChunkReload() {
  if (_installed) return;
  _installed = true;

  window.addEventListener("vite:preloadError", (e: any) => {
    try { e.preventDefault?.(); } catch (_) {}
    reloadOnce();
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const msg = String(e?.reason?.message ?? e?.reason ?? "");
    if (looksLikeStaleChunk(msg)) reloadOnce();
  });

  window.addEventListener("error", (e: ErrorEvent) => {
    const msg = String(e?.message ?? "");
    if (looksLikeStaleChunk(msg)) reloadOnce();
  });
}
