import QRCode from 'qrcode';

export async function generateQRCodeDataURL(data: string, size = 300): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: 'M',
    width: size,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

export async function generateQRCodeSVG(data: string): Promise<string> {
  return QRCode.toString(data, { type: 'svg', errorCorrectionLevel: 'M' });
}

export function generateBarcodePattern(data: string): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  canvas.width = 200;
  canvas.height = 50;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) & 0xffffffff;
  }
  for (let i = 0; i < canvas.width; i += 3) {
    if ((hash + i) % 7 > 2) ctx.fillRect(i, 5, 2, canvas.height - 10);
  }
  return canvas.toDataURL();
}
