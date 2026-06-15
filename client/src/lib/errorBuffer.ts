interface BufferedError {
  time: string;
  level: 'error' | 'warn' | 'rejection' | 'network';
  message: string;
}

const BUFFER: BufferedError[] = [];
const MAX = 30;
let _installed = false;

function push(level: BufferedError['level'], raw: string) {
  try {
    BUFFER.push({ time: new Date().toISOString(), level, message: raw.slice(0, 500) });
    if (BUFFER.length > MAX) BUFFER.shift();
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
}

export function getRecentErrors(): string[] {
  return BUFFER.map((e) => `[${e.time}] [${e.level.toUpperCase()}] ${e.message}`);
}
