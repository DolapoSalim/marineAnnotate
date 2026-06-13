import React from 'react';
import { useImageUrl } from '../hooks/useImageUrl';

interface Props {
  thumbnailUrl: string | null;
  alt: string;
  style?: React.CSSProperties;
}

/**
 * Renders an image thumbnail fetched with JWT auth via axios.
 * Shows a skeleton while loading.
 */
export const ImageThumbnail: React.FC<Props> = ({ thumbnailUrl, alt, style }) => {
  const blobUrl = useImageUrl(thumbnailUrl);

  if (!blobUrl) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #0d1f17 0%, #112a1e 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '2px solid rgba(29,158,117,0.2)',
          borderTopColor: '#1D9E75',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover',
        ...style,
      }}
    />
  );
};