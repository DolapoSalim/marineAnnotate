import React from 'react';
import { useNavigate } from 'react-router-dom';

interface LogoProps {
  size?: number;
  showName?: boolean;
  onClick?: () => void;
}

/**
 * Single source-of-truth logo mark for MarineAnnotate.
 * Used identically across every page — landing, login, dashboard, project,
 * gallery, annotator, admin. Clicking it always navigates to the landing page
 * unless a custom onClick is provided.
 *
 * This is the ONLY place the app's icon/wordmark should be defined.
 * Do not hardcode emoji or duplicate SVGs elsewhere — import this component.
 */
export const Logo: React.FC<LogoProps> = ({ size = 24, showName = true, onClick }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) onClick();
    else navigate('/');
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        cursor: 'pointer', userSelect: 'none',
      }}
      title="Go to home"
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#0d2e1e" stroke="#1D9E75" strokeWidth="1.5" />
        <path
          d="M8 16 C8 11 12 8 18 8 C24 8 27 11 27 16 C27 21 24 24 18 24 C12 24 8 21 8 16Z"
          fill="#1D9E75" opacity="0.9"
        />
        <path d="M8 16 L3 11 L3 21 Z" fill="#1D9E75" opacity="0.7" />
        <circle cx="22" cy="13.5" r="2" fill="#0d2e1e" />
        <circle cx="22.7" cy="13" r="0.7" fill="white" />
      </svg>
      {showName && (
        <span style={{
          fontSize: Math.round(size * 0.62),
          fontWeight: 600,
          color: '#e8edf2',
          letterSpacing: '-0.3px',
          whiteSpace: 'nowrap',
        }}>
          MarineAnnotate
        </span>
      )}
    </div>
  );
};