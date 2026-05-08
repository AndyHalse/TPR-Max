import { useState, useEffect } from 'react';
import { generateQRCodeDataURL } from '@/lib/qr-generator';

export function useQRCode(data: string | undefined | null, size = 300): string {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    if (!data) { setDataUrl(''); return; }
    let cancelled = false;
    generateQRCodeDataURL(data, size)
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [data, size]);
  return dataUrl;
}
