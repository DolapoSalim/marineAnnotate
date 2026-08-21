import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { authApi } from '../api';
import { Logo } from '../components/ui/Logo';

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authApi.forgotPassword(email);
      // Always show the same success state regardless of whether the email
      // is registered — matching the backend's anti-enumeration response.
      setDone(true);
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('Too many requests — please wait a few minutes before trying again.');
      } else {
        setError('Something went wrong — please try again.');
      }
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
            <div style={{ color: '#e8edf2', fontWeight: 500, marginBottom: 8 }}>Check your email</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: '0 0 20px' }}>
              If <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{email}</strong> is registered, a reset
              link is on its way. It expires in 1 hour.
            </p>
            <button onClick={() => navigate('/login')} style={primaryBtn}>Back to login</button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>
              Reset your password
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 24px' }}>
              Enter your email and we'll send you a reset link
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Email address</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoFocus placeholder="you@lab.edu" style={inputStyle}
                />
              </div>
              {error && (
                <div style={{ color: '#f87171', fontSize: 13, padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 7 }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <button
              onClick={() => navigate('/login')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 20,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', fontSize: 13,
              }}
            >
              <ArrowLeft size={13} /> Back to login
            </button>
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
