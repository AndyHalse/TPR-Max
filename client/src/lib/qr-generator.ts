export function generateQRCode(text: string): string {
  // Optimized QR code for direct thermal printers - high contrast black/white only
  // Using larger size and error correction for better thermal printer readability
  const encodedText = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=M&color=000000&bgcolor=ffffff&data=${encodedText}`;
}

export function generateBarcodePattern(data: string): string {
  // Simple pattern generator for demonstration
  // This creates a basic black and white pattern based on the input data
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return '';
  
  canvas.width = 200;
  canvas.height = 50;
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#000000';
  
  // Create bars based on data hash
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) & 0xffffffff;
  }
  
  for (let i = 0; i < canvas.width; i += 3) {
    if ((hash + i) % 7 > 2) {
      ctx.fillRect(i, 5, 2, canvas.height - 10);
    }
  }
  
  return canvas.toDataURL();
}
