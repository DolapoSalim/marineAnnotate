import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, authApi } from '../api';
import { useAuthStore } from '../store';

// Animated underwater particles
const Bubble: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div style={{
    position: 'absolute', borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    animation: 'rise linear infinite',
    ...style,
  }} />
);

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
      const token = tokenRes.data.access_token;
      localStorage.setItem('access_token', token);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const meRes = await authApi.me();
      setAuth(meRes.data, token);
      navigate('/');
    } catch (err: any) {
      localStorage.removeItem('access_token');
      delete api.defaults.headers.common['Authorization'];
      if (err.response?.status === 401) setError('Invalid email or password');
      else if (err.response?.status === 429) setError('Too many attempts — try again in 15 minutes');
      else setError('Connection failed — is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const bubbles = Array.from({ length: 18 }, (_, i) => ({
    width: `${8 + Math.random() * 24}px`,
    height: `${8 + Math.random() * 24}px`,
    left: `${Math.random() * 100}%`,
    bottom: `-60px`,
    animationDuration: `${6 + Math.random() * 10}s`,
    animationDelay: `${Math.random() * 8}s`,
    opacity: 0.3 + Math.random() * 0.4,
  }));

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(180deg, #020f1a 0%, #041e2e 40%, #072a1f 100%)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes rise {
          0% { transform: translateY(0) scale(1); opacity: 0.5; }
          50% { opacity: 0.8; }
          100% { transform: translateY(-110vh) scale(0.3); opacity: 0; }
        }
        @keyframes sway {
          0%,100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .login-card { animation: fadeUp 0.7s ease forwards; }
        .field-input:focus { border-color: rgba(29,200,140,0.6) !important; box-shadow: 0 0 0 3px rgba(29,200,140,0.12); }
        .sign-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(29,158,117,0.4); }
        .sign-btn:active { transform: translateY(0); }
      `}</style>

      {/* Animated seaweed */}
      {[15,30,55,72,88].map((left, i) => (
        <div key={i} style={{
          position: 'absolute', bottom: 0, left: `${left}%`,
          width: 3 + i % 2, height: `${80 + i * 30}px`,
          background: `linear-gradient(180deg, #0d4a2a, #0a6b35)`,
          borderRadius: '40% 60% 60% 40%',
          animation: `sway ${3 + i * 0.4}s ease-in-out infinite`,
          animationDelay: `${i * 0.3}s`,
          transformOrigin: 'bottom center',
          opacity: 0.7,
        }} />
      ))}

      {/* Bubbles */}
      {bubbles.map((b, i) => <Bubble key={i} style={b} />)}

      {/* Subtle grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Left panel — branding */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '0 80px',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ animation: 'fadeUp 0.6s ease forwards' }}>
          <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>🐠</div>
          <h1 style={{
            fontFamily: 'Syne, sans-serif', fontSize: 52, fontWeight: 800,
            color: '#fff', margin: '0 0 12px', lineHeight: 1.1,
            background: 'linear-gradient(135deg, #ffffff 30%, #1DC88C)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Marine<br />Annotate
          </h1>
          <p style={{
            fontFamily: 'DM Sans, sans-serif', fontSize: 16,
            color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 360,
          }}>
            In-house annotation platform for underwater marine imagery — seagrasses, macroalgae, and fish species.
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
            {[['🌿','Seagrass'],['🪸','Macroalgae'],['🐟','Fish Species']].map(([icon, label]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        width: 440, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 32, position: 'relative', zIndex: 1,
      }}>
        <div className="login-card" style={{
          width: '100%', background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: '40px 36px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
        }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
              Sign in
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              Access your lab workspace
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {['Email', 'Password'].map((label) => (
              <div key={label}>
                <label style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 7, letterSpacing: '0.04em' }}>
                  {label.toUpperCase()}
                </label>
                <input
                  className="field-input"
                  type={label === 'Password' ? 'password' : 'email'}
                  value={label === 'Email' ? email : password}
                  onChange={(e) => label === 'Email' ? setEmail(e.target.value) : setPassword(e.target.value)}
                  required
                  placeholder={label === 'Email' ? 'you@lab.local' : '••••••••'}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 14,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'DM Sans', transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                />
              </div>
            ))}

            {error && (
              <div style={{
                background: 'rgba(226,75,74,0.12)', border: '1px solid rgba(226,75,74,0.3)',
                borderRadius: 8, padding: '10px 14px', fontSize: 13,
                color: '#f87171', fontFamily: 'DM Sans',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading} className="sign-btn"
              style={{
                padding: '13px', borderRadius: 10, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, #1DC88C, #1D9E75)',
                color: '#fff', fontWeight: 600, fontSize: 15,
                fontFamily: 'Syne, sans-serif',
                opacity: loading ? 0.7 : 1, marginTop: 6,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};