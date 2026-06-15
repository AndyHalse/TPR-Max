interface BufferedError {
  time: string;
  level: 'error' | 'warn' | 'rejection' | 'network';
  message: string;
}

interface Breadcrumb {
  time: string;
  type: 'route' | 'click';
  detail: string;
}

const BUFFER: BufferedError[] = [];
const MAX = 30;
const BREADCRUMBS: Breadcrumb[] = [];
const MAX_BC = 15;
let _installed = false;
let _lastSeenErrorId: string | null = null;

function push(level: BufferedError['level'], raw: string) {
  try {
    BUFFER.push({ time: new Date().toISOString(), level, message: raw.slice(0, 500) });
    if (BUFFER.length > MAX) BUFFER.shift();
  } catch (_) {}
}

function pushBreadcrumb(type: Breadcrumb['type'], detail: string) {
  try {
    BREADCRUMBS.push({ time: new Date().toISOString(), type, detail: detail.slice(0, 120) });
    if (BREADCRUMBS.length > MAX_BC) BREADCRUMBS.shift();
  } catch (_) {}
}

export function installErrorBuffer() {
  if (_installed) return;
  _installed = true;

  window.addEventListener("error", (e) => {
    push('error', e.message || String(e));
  });

  window.addEventListener("unhandledrejection", (e) => {
    push('rejection', String(e.reason?.message || e.reason || "Unhandled rejection"));
  });

  try {
    const origError = console.error.bind(console);
    console.error = (...args: any[]) => {
      try { push('error', args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')); } catch (_) {}
      origError(...args);
    };

    const origWarn = console.warn.bind(console);
    console.warn = (...args: any[]) => {
      try { push('warn', args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')); } catch (_) {}
      origWarn(...args);
    };
  } catch (_) {}

  try {
    const origFetch = window.fetch.bind(window);
    (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url =
        typeof input === 'string' ? input
        : input instanceof URL ? input.pathname + input.search
        : (input as Request).url;
      const shortUrl = url.length > 200 ? url.slice(0, 200) + '…' : url;
      try {
        const resp = await origFetch(input, init);
        if (!resp.ok) push('network', `HTTP ${resp.status} ${method} ${shortUrl}`);
        return resp;
      } catch (err: any) {
        push('network', `FETCH_ERR ${method} ${shortUrl} — ${err?.message ?? String(err)}`);
        throw err;
      }
    };
  } catch (_) {}

  // Breadcrumbs — route changes
  try {
    const recordRoute = () => pushBreadcrumb('route', window.location.pathname + window.location.search);
    recordRoute();
    window.addEventListener('popstate', recordRoute);
    const origPush = history.pushState.bind(history);
    history.pushState = (...args) => { origPush(...args); recordRoute(); };
    const origReplace = history.replaceState.bind(history);
    history.replaceState = (...args) => { origReplace(...args); recordRoute(); };
  } catch (_) {}

  // Breadcrumbs — button/link clicks (delegated, never captures input values)
  try {
    document.addEventListener('click', (e) => {
      try {
        const el = (e.target as Element)?.closest('button, a, [role="button"], [data-testid]');
        if (!el) return;
        const text = (
          el.getAttribute('data-testid') ||
          el.getAttribute('aria-label') ||
          (el.textContent ?? '').trim().replace(/\s+/g, ' ')
        ).slice(0, 80);
        if (text) pushBreadcrumb('click', `${el.tagName.toLowerCase()}:${text}`);
      } catch (_) {}
    }, { capture: true, passive: true });
  } catch (_) {}
}

export function getRecentErrors(): string[] {
  return BUFFER.map((e) => `[${e.time}] [${e.level.toUpperCase()}] ${e.message}`);
}

export function getBreadcrumbs(): string[] {
  return BREADCRUMBS.map((b) => `[${b.time}] [${b.type.toUpperCase()}] ${b.detail}`);
}

export function pushCrash(message: string, stack: string, componentStack: string) {
  push('error', `[CRASH] ${message}\n${stack.slice(0, 300)}\nComponent:${componentStack.split('\n').slice(0, 4).join(' ')}`);
}

export function setLastErrorId(id: string) {
  _lastSeenErrorId = id;
}

export function getLastErrorId(): string | null {
  return _lastSeenErrorId;
}
