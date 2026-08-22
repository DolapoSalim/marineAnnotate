import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, AlertCircle, KeyRound } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { authApi } from '../api';
import { useAuthStore } from '../store';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, setAuth } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (newPassword !== confirm) { setError('New passwords do not match'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (!/\d/.test(newPassword)) { setError('New password must contain at least one digit'); return; }

    setLoading(true);
    try {
      const res = await authApi.changePassword(currentPassword, newPassword);
      // Other sessions (other tabs/devices) are invalidated server-side, but
      // this one gets a fresh token pair back — swap it in so this tab stays
      // logged in instead of getting kicked out by its own request.
      if (user) setAuth(user, res.data.access_token);
      setSuccess(true);
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a1220', color: '#e8edf2', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
        borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.015)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/dashboard')} style={iconBtn}><ArrowLeft size={15} /></button>
        <Logo size={24} showName={false} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Settings</span>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
          borderRadius: 14, padding: '24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <KeyRound size={16} style={{ color: '#1D9E75' }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>Change password</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
            Signed in as {user?.email}. Changing your password signs out every other session
            (other tabs, other devices) — this one stays signed in.
          </div>

          {success && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8,
              marginBottom: 16, fontSize: 13, background: 'rgba(29,158,117,0.15)',
              border: '0.5px solid rgba(29,158,117,0.4)', color: '#1D9E75',
            }}>
              <CheckCircle size={14} /> Password updated.
            </div>
          )}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8,
              marginBottom: 16, fontSize: 13, background: 'rgba(226,75,74,0.15)',
              border: '0.5px solid rgba(226,75,74,0.4)', color: '#E24B4A',
            }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Current password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                required autoFocus style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>New password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                required style={inputStyle} placeholder="At least 8 characters, one digit" />
            </div>
            <div>
              <label style={labelStyle}>Confirm new password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                required style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.12)',
  background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
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
  background: '#1D9E75', color: '#fff', fontWeight: 600, fontSize: 14, marginTop: 4,
};
