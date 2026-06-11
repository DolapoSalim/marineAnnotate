import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuthStore } from '../store';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const tokenRes = await authApi.login(email, password);
      const meRes = await authApi.me();
      setAuth(meRes.data, tokenRes.data.access_token);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a1628 0%, #0b3d2e 100%)',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '40px 36px', width: 380,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🐠</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>MarineAnnotate</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>
            Sign in to your lab account
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
                background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)',
                color: '#fff', outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="admin@lab.local"
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
                background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)',
                color: '#fff', outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(226,75,74,0.15)', border: '0.5px solid rgba(226,75,74,0.4)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#E24B4A',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: '#1D9E75', color: '#fff', fontWeight: 600, fontSize: 14,
              opacity: loading ? 0.7 : 1, marginTop: 4,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};
