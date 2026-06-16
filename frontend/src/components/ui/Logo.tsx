import React from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  size?: number;
  showName?: boolean;
  style?: React.CSSProperties;
}

export const Logo: React.FC<Props> = ({ size = 28, showName = true, style }) => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/')}
      title="MarineAnnotate — Home"
      style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...style }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <rect x="2" y="2" width="28" height="28" rx="7" fill="#0d2e1e" stroke="#1D9E75" strokeWidth="1.5" strokeDasharray="3 2"/>
        <path d="M8 16 C8 11 12 8 18 8 C24 8 27 11 27 16 C27 21 24 24 18 24 C12 24 8 21 8 16Z" fill="#1D9E75" opacity="0.9"/>
        <path d="M8 16 L3 11 L3 21 Z" fill="#1D9E75" opacity="0.7"/>
        <circle cx="22" cy="13.5" r="2" fill="#030e0a"/>
        <circle cx="22.7" cy="13" r="0.7" fill="white"/>
        <path d="M13 8 C15 5 19 5 21 8" stroke="#0a5c42" strokeWidth="1.2" fill="none"/>
        <rect x="1" y="1" width="4" height="4" rx="1" fill="#1D9E75"/>
        <rect x="27" y="1" width="4" height="4" rx="1" fill="#1D9E75"/>
        <rect x="1" y="27" width="4" height="4" rx="1" fill="#1D9E75"/>
        <rect x="27" y="27" width="4" height="4" rx="1" fill="#1D9E75"/>
      </svg>
      {showName && (
        <span style={{ fontWeight: 600, fontSize: size * 0.57, color: '#e8edf2', letterSpacing: '-0.3px', fontFamily: "'Inter', system-ui, sans-serif" }}>
          MarineAnnotate
        </span>
      )}
    </button>
  );
};