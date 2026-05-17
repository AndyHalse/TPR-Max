/**
 * printPassViaIframe
 *
 * Loads a pass URL into a hidden <iframe> and triggers window.print() inside it.
 * This avoids opening a popup window so it works even when popups are blocked,
 * and stays on the current kiosk screen with no visible UI interruption.
 *
 * For completely silent printing (no browser dialog) run Chrome / Edge with:
 *   --kiosk-printing
 * e.g. chrome.exe --kiosk --kiosk-printing --app=https://your-tpr-domain.com/kiosk
 *
 * The pass HTML page already contains <body onload="window.print()"> so the
 * print fires automatically as soon as the iframe finishes loading.
 */
export function printPassViaIframe(url: string): void {
  // Remove any lingering print frame from a previous call
  const existing = document.getElementById('__tpr-print-frame__');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '__tpr-print-frame__';
  iframe.setAttribute('aria-hidden', 'true');
  // Position entirely off-screen — invisible but fully rendered
  iframe.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;width:95mm;height:65mm;' +
    'border:none;visibility:hidden;pointer-events:none;';

  iframe.src = url;

  // The pass HTML calls window.print() on its own onload.
  // We just need to clean up the iframe afterwards.
  iframe.addEventListener('load', () => {
    // Give the browser print dialog time to open before we remove the frame.
    // afterprint fires when the dialog closes (Chrome/Edge/Firefox).
    const win = iframe.contentWindow;
    if (win) {
      win.addEventListener('afterprint', () => {
        setTimeout(() => iframe.remove(), 500);
      });
    }
    // Fallback cleanup after 30 s in case afterprint doesn't fire
    setTimeout(() => {
      if (document.contains(iframe)) iframe.remove();
    }, 30_000);
  });

  document.body.appendChild(iframe);
}
