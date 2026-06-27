import { logger } from './utils/logger';

const POSTCODES_IO_BASE = 'https://api.postcodes.io';

function normalise(postcode: string): string {
  return postcode.trim().toUpperCase().replace(/\s+/g, ' ');
}

export async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encoded = encodeURIComponent(normalise(postcode));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${POSTCODES_IO_BASE}/postcodes/${encoded}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 200 || !data.result) return null;
    return { lat: data.result.latitude, lng: data.result.longitude };
  } catch (err: any) {
    logger.warn('[geocode] postcodes.io lookup failed (non-fatal):', err?.message ?? err);
    return null;
  }
}

export async function geocodePostcodesBulk(
  postcodes: string[],
): Promise<Map<string, { lat: number; lng: number } | null>> {
  const result = new Map<string, { lat: number; lng: number } | null>();
  if (postcodes.length === 0) return result;

  for (let i = 0; i < postcodes.length; i += 100) {
    const chunk = postcodes.slice(i, i + 100);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${POSTCODES_IO_BASE}/postcodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: chunk }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        for (const pc of chunk) result.set(pc, null);
        continue;
      }
      const data = await res.json();
      for (const item of data.result ?? []) {
        if (item.result) {
          result.set(item.query, { lat: item.result.latitude, lng: item.result.longitude });
        } else {
          result.set(item.query, null);
        }
      }
    } catch (err: any) {
      logger.warn('[geocode] bulk postcodes.io lookup failed (non-fatal):', err?.message ?? err);
      for (const pc of chunk) result.set(pc, null);
    }
  }
  return result;
}
