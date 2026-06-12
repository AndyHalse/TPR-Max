interface BufferedError {
  time: string;
  message: string;
}

const BUFFER: BufferedError[] = [];
const MAX = 10;

function push(message: string) {
  BUFFER.push({ time: new Date().toISOString(), message: message.slice(0, 500) });
  if (BUFFER.length > MAX) BUFFER.shift();
}

export function installErrorBuffer() {
  window.addEventListener("error", (e) => {
    push(e.message || String(e));
  });
  window.addEventListener("unhandledrejection", (e) => {
    push(String(e.reason?.message || e.reason || "Unhandled rejection"));
  });
}

export function getRecentErrors(): string[] {
  return BUFFER.map((e) => `[${e.time}] ${e.message}`);
}
