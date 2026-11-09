import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, AlertCircle } from 'lucide-react';

interface QrCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
  alt?: string;
}

export function QrCodeDisplay({ 
  value, 
  size = 180, 
  className = '', 
  alt = 'QR Code Pix Oficial' 
}: QrCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!value || typeof value !== 'string') {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    // If the value is already a data URL image, use it directly
    if (value.startsWith('data:image/')) {
      setDataUrl(value);
      setLoading(false);
      return;
    }

    // Generate real, high-resolution QR code
    QRCode.toDataURL(value.trim(), {
      width: Math.max(size * 2, 300),
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (isMounted) {
          setDataUrl(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Erro ao codificar QR Code Pix:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [value, size]);

  if (loading) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className={`bg-white rounded-xl flex flex-col items-center justify-center p-2 border border-zinc-200 shadow-md ${className}`}
      >
        <Loader2 className="w-8 h-8 text-[#009EE3] animate-spin" />
        <span className="text-[10px] text-zinc-500 mt-2 font-medium">Gerando QR Code...</span>
      </div>
    );
  }

  if (error || !dataUrl) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className={`bg-white rounded-xl flex flex-col items-center justify-center p-3 text-zinc-600 text-xs text-center border border-zinc-200 shadow-md ${className}`}
      >
        <AlertCircle className="w-6 h-6 text-red-500 mb-1" />
        <span className="text-[10px] text-zinc-500">Erro ao renderizar imagem</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      style={{ width: size, height: size }}
      className={`object-contain bg-white rounded-xl border border-zinc-200 shadow-md ${className}`}
    />
  );
}
