import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { authApi } from '../api';
import { Logo } from '../components/ui/Logo';

export const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(token ? '' : 'Invalid reset link — missing token.');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/\d/.test(password)) { setError('Password must contain at least one digit'); return; }

    setLoading(true);
    setError('');
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #030e0a 0%, #0a1628 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '40px 36px', width: 400,
      }}>
        <div style={{ marginBottom: 28 }}>
          <Logo size={32} showName={true} />
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle size={40} style={{ color: '#1D9E75', marginBottom: 12 }} />
            <div style={{ color: '#1D9E75', fontWeight: 500 }}>Password updated! Redirecting to login…</div>
          </div>
        ) : !token ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#f87171', marginBottom: 16, fontSize: 14 }}>{error}</div>
            <button onClick={() => navigate('/forgot-password')} style={primaryBtn}>Request a new link</button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>
              Choose a new password
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 24px' }}>
              At least 8 characters, with at least one digit
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>New password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required autoFocus style={inputStyle} placeholder="Minimum 8 characters" />
              </div>
              <div>
                <label style={labelStyle}>Confirm new password</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  required style={inputStyle} placeholder="Repeat password" />
              </div>
              {error && (
                <div style={{ color: '#f87171', fontSize: 13, padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 7 }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6, fontWeight: 500,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', outline: 'none',
};
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#1D9E75', color: '#fff', fontWeight: 600, fontSize: 14,
};
