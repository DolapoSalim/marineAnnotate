import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, authApi } from '../api';
import { useAuthStore } from '../store';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Subtle caustic light animation — clean, not vibe-coded
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;
    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Slow-moving radial gradient blobs simulating underwater caustics
      const blobs = [
        { x: 0.3, y: 0.2, r: 0.35, phase: 0 },
        { x: 0.7, y: 0.6, r: 0.28, phase: 2.1 },
        { x: 0.5, y: 0.8, r: 0.22, phase: 4.2 },
      ];

      blobs.forEach(b => {
        const cx = (b.x + Math.sin(t * 0.3 + b.phase) * 0.08) * canvas.width;
        const cy = (b.y + Math.cos(t * 0.2 + b.phase) * 0.06) * canvas.height;
        const r = b.r * Math.min(canvas.width, canvas.height);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(29,158,117,${0.07 + Math.sin(t * 0.4 + b.phase) * 0.02})`);
        grad.addColorStop(1, 'rgba(29,158,117,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      t += 0.008;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

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
      navigate('/dashboard');
    } catch (err: any) {
      localStorage.removeItem('access_token');
      delete api.defaults.headers.common['Authorization'];
      if (err.response?.status === 429) {
        setError('Too many attempts — please wait 15 minutes before trying again.');
      } else {
        setError('Incorrect email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#030e0a',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Animated background */}
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }} />

      {/* Deep ocean background gradient */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 30% 50%, #041a10 0%, #020c07 60%, #010806 100%)',
      }} />

      {/* Left panel — branding */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px 80px', position: 'relative', zIndex: 1,
      }}>
        <div style={{ maxWidth: 480 }}>
          {/* Logo mark */}
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #1D9E75, #0a5c42)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 40, boxShadow: '0 0 32px rgba(29,158,117,0.3)',
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 14 C4 8 8 4 14 4 C20 4 24 8 24 14" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M4 14 C4 20 8 24 14 24" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <circle cx="14" cy="14" r="3" fill="white"/>
              <path d="M17 14 C19 12 22 13 24 14 C22 15 19 16 17 14Z" fill="white"/>
            </svg>
          </div>

          <h1 style={{
            fontSize: 40, fontWeight: 600, color: '#ffffff',
            margin: '0 0 16px', letterSpacing: '-1px', lineHeight: 1.1,
          }}>
            MarineAnnotate
          </h1>
          <p style={{
            fontSize: 17, color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.7, margin: '0 0 48px', fontWeight: 400,
          }}>
            Precision image annotation for marine biology research. Label seagrass, macroalgae, and fish species — with AI-assisted workflows built for your lab.
          </p>

          {/* Feature list */}
          {[
            'AI-assisted labelling with your trained models',
            'Bounding boxes, polygons, keypoints and classification',
            'Real-time collaboration for your whole team',
            'Export to COCO, YOLO, Pascal VOC and CSV',
          ].map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(29,158,117,0.2)', border: '1px solid rgba(29,158,117,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3 5.5L6.5 2" stroke="#1D9E75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={{
        width: 440, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '40px', position: 'relative', zIndex: 1,
        background: 'rgba(255,255,255,0.02)',
        borderLeft: '0.5px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>
              Sign in
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              Use your lab account credentials
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 500,
                color: 'rgba(255,255,255,0.6)', marginBottom: 7,
              }}>
                Email address
              </label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                required autoFocus
                placeholder="you@lab.edu"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 9,
                  fontSize: 14, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(29,158,117,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 500,
                color: 'rgba(255,255,255,0.6)', marginBottom: 7,
              }}>
                Password
              </label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••••••"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 9,
                  fontSize: 14, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(29,158,117,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 13,
                background: 'rgba(226,75,74,0.1)',
                border: '1px solid rgba(226,75,74,0.3)',
                color: '#f87171',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                marginTop: 4, padding: '12px', borderRadius: 9, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading
                  ? 'rgba(29,158,117,0.5)'
                  : 'linear-gradient(135deg, #1D9E75, #158a62)',
                color: '#fff', fontWeight: 600, fontSize: 15,
                letterSpacing: '-0.2px',
                boxShadow: loading ? 'none' : '0 0 24px rgba(29,158,117,0.25)',
                transition: 'all 0.15s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in to your account'}
            </button>
          </form>

          <p style={{
            marginTop: 28, fontSize: 12, color: 'rgba(255,255,255,0.2)',
            textAlign: 'center', lineHeight: 1.5,
          }}>
            Access is by invitation only.<br />
            Contact your lab administrator to request access.
          </p>
        </div>
      </div>
    </div>
  );
};