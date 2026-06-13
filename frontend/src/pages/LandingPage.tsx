import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redirect logged-in users to dashboard
  useEffect(() => { if (token) navigate('/dashboard'); }, [token]);

  // Animated particle ocean background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const particles: { x: number; y: number; r: number; vx: number; vy: number; alpha: number; color: string }[] = [];
    const colors = ['#1D9E75', '#0b3d2e', '#134e3a', '#0d6b52', '#22c55e', '#86efac'];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 3 + 0.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.2,
        alpha: Math.random() * 0.4 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(p.alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
      });
      // Draw connections
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(29,158,117,${0.08 * (1 - d / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  const features = [
    { icon: '🎯', title: 'Precision Annotation', desc: 'Bounding boxes, polygons, keypoints and classification tags — all in one fluid canvas.' },
    { icon: '🤖', title: 'AI-Assisted Labelling', desc: 'Upload your trained YOLO model and let AI suggest annotations. Review, edit, accept or reject in seconds.' },
    { icon: '🔬', title: 'Marine Taxonomy', desc: 'Built-in species hierarchy support for seagrasses, macroalgae and fish — your domain, your structure.' },
    { icon: '👥', title: 'Live Collaboration', desc: 'Multiple lab members annotate simultaneously. See each other\'s changes in real time.' },
    { icon: '🔒', title: 'Fully Private', desc: 'All data stays on your lab server. Nothing leaves your network. Invite-only access.' },
    { icon: '📦', title: 'Export Anywhere', desc: 'COCO JSON, YOLO, Pascal VOC, CSV. Drop straight into any training pipeline.' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#030d0a', color: '#e8edf2', fontFamily: "'Fraunces', serif", overflow: 'hidden', position: 'relative' }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700;900&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet" />

      {/* Particle canvas */}
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />

      {/* Radial glow */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 800, height: 800, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(29,158,117,0.12) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Nav */}
      <nav style={{
        position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center',
        padding: '20px 48px', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 24 }}>🐠</span>
        <span style={{ marginLeft: 10, fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' }}>MarineAnnotate</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate('/login')} style={{
          padding: '9px 24px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.2)',
          background: 'transparent', color: '#e8edf2', fontSize: 14, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
          transition: 'all 0.2s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Sign in
        </button>
      </nav>

      {/* Hero */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '100px 24px 80px' }}>
        <div style={{
          display: 'inline-block', padding: '4px 16px', borderRadius: 20,
          background: 'rgba(29,158,117,0.15)', border: '0.5px solid rgba(29,158,117,0.4)',
          fontSize: 13, color: '#1D9E75', marginBottom: 28, fontFamily: "'DM Sans', sans-serif",
        }}>
          Built for marine biology research labs
        </div>

        <h1 style={{
          fontSize: 'clamp(48px, 8vw, 88px)', fontWeight: 900, lineHeight: 1.05,
          letterSpacing: '-2px', margin: '0 0 24px',
          background: 'linear-gradient(135deg, #ffffff 0%, #86efac 50%, #1D9E75 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Annotate the<br />ocean's secrets
        </h1>

        <p style={{
          fontSize: 19, color: 'rgba(255,255,255,0.55)', maxWidth: 540, margin: '0 auto 48px',
          lineHeight: 1.7, fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
        }}>
          A private, AI-assisted annotation platform for seagrass, macroalgae and fish species identification — built to run entirely in your lab.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '14px 36px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #1D9E75, #0d6b52)',
            color: '#fff', fontSize: 16, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: '0 0 40px rgba(29,158,117,0.35)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 50px rgba(29,158,117,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(29,158,117,0.35)'; }}
          >
            Enter the platform →
          </button>
        </div>
      </div>

      {/* Animated ocean divider */}
      <div style={{ position: 'relative', zIndex: 1, height: 120, overflow: 'hidden', margin: '0 0 80px' }}>
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D9E75" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#030d0a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,60 C360,100 720,20 1080,60 C1260,80 1380,40 1440,60 L1440,120 L0,120 Z" fill="url(#wg)">
            <animateTransform attributeName="transform" type="translate" from="0,0" to="-200,0" dur="8s" repeatCount="indefinite" />
          </path>
          <path d="M0,80 C240,40 600,100 960,60 C1200,40 1380,80 1440,70 L1440,120 L0,120 Z" fill="rgba(29,158,117,0.06)">
            <animateTransform attributeName="transform" type="translate" from="0,0" to="200,0" dur="11s" repeatCount="indefinite" />
          </path>
        </svg>
      </div>

      {/* Feature grid */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '0 24px 120px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 700, marginBottom: 48, letterSpacing: '-1px' }}>
          Everything your lab needs
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {features.map((f, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.025)', border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '24px',
              transition: 'border-color 0.2s, background 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(29,158,117,0.4)'; e.currentTarget.style.background = 'rgba(29,158,117,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.3px' }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '24px', borderTop: '0.5px solid rgba(255,255,255,0.06)', fontSize: 13, color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Sans', sans-serif" }}>
        MarineAnnotate · Private lab software · All data stays local
      </div>
    </div>
  );
};
