import { useQRCode } from '@/hooks/useQRCode';

interface QRCodeImageProps {
  data: string | undefined | null;
  size?: number;
  className?: string;
  alt?: string;
}

export default function QRCodeImage({ data, size = 300, className, alt = 'QR Code' }: QRCodeImageProps) {
  const dataUrl = useQRCode(data, size);
  if (!dataUrl) {
    return (
      <div
        className={className}
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}
      >
        <span style={{ fontSize: 10, color: '#9ca3af' }}>QR</span>
      </div>
    );
  }
  return <img src={dataUrl} alt={alt} className={className} width={size} height={size} />;
}
