import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export const AcceptInvitePage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();

  const [invite, setInvite] = useState<{ email: string; full_name: string; role: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError('Invalid invite link'); setLoading(false); return; }
    api.get(`/api/invites/validate/${token}`)
      .then(r => { setInvite(r.data); setFullName(r.data.full_name); })
      .catch(() => setError('This invite link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/api/invites/accept', { token, password, full_name: fullName });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a1628 0%, #0b3d2e 100%)',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{
        background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '40px 36px', width: 400, backdropFilter: 'blur(12px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🐠</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', margin: 0 }}>Join MarineAnnotate</h1>
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Validating invite…</div>}

        {!loading && error && !invite && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#E24B4A', marginBottom: 16, fontSize: 14 }}>{error}</div>
            <button onClick={() => navigate('/login')} style={primaryBtn}>Back to login</button>
          </div>
        )}

        {done && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ color: '#1D9E75', fontWeight: 500 }}>Account created! Redirecting to login…</div>
          </div>
        )}

        {!loading && invite && !done && (
          <>
            <div style={{ background: 'rgba(29,158,117,0.1)', border: '0.5px solid rgba(29,158,117,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
              Invited as <strong style={{ color: '#1D9E75' }}>{invite.email}</strong> · <span style={{ textTransform: 'capitalize' }}>{invite.role}</span>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Full name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} required style={inputStyle} placeholder="Your full name" />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} placeholder="Min. 8 characters" />
              </div>
              <div>
                <label style={labelStyle}>Confirm password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={inputStyle} placeholder="Repeat password" />
              </div>
              {error && <div style={{ color: '#E24B4A', fontSize: 13 }}>{error}</div>}
              <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 4 }}>
                {loading ? 'Creating account…' : 'Create my account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 5 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)',
  color: '#fff', outline: 'none',
};
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#1D9E75', color: '#fff', fontWeight: 600, fontSize: 14,
};
