import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Users, Image, LogOut } from 'lucide-react';
import { projectsApi } from '../api';
import { useAuthStore } from '../store';
import type { Project } from '../types';

export const DashboardPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    projectsApi.list().then((r) => setProjects(r.data)).finally(() => setLoading(false));
  }, []);

  const createProject = async () => {
    if (!newName.trim()) return;
    const res = await projectsApi.create({ name: newName, description: newDesc });
    setProjects((p) => [res.data, ...p]);
    setShowCreate(false);
    setNewName(''); setNewDesc('');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f1923', color: '#e8edf2' }}>
      {/* Topbar */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{ fontSize: 18, marginRight: 8 }}>🐠</span>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>MarineAnnotate</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginRight: 16 }}>
          {user?.full_name} · <span style={{ textTransform: 'capitalize' }}>{user?.role}</span>
        </span>
        {user?.role === 'admin' && (
          <button onClick={() => navigate('/admin')} style={ghostBtn}>
            Admin
          </button>
        )}
        <button onClick={clearAuth} style={{ ...ghostBtn, marginLeft: 8 }}>
          <LogOut size={14} />
        </button>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Projects</h2>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#1D9E75', color: '#fff', fontWeight: 500, fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Plus size={15} /> New project
          </button>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16 }}>New Project</h3>
              <input
                placeholder="Project name"
                value={newName} onChange={(e) => setNewName(e.target.value)}
                style={inputStyle} autoFocus
              />
              <textarea
                placeholder="Description (optional)"
                value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', marginTop: 10 }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={() => setShowCreate(false)} style={cancelBtn}>Cancel</button>
                <button onClick={createProject} style={primaryBtn}>Create</button>
              </div>
            </div>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: 60 }}>
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 0',
            color: 'rgba(255,255,255,0.3)',
          }}>
            <FolderOpen size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div>No projects yet. Create your first one.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
                  borderRadius: 12, padding: '20px', cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(29,158,117,0.5)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
              >
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{p.name}</div>
                {p.description && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 12, lineHeight: 1.5 }}>
                    {p.description.slice(0, 80)}{p.description.length > 80 ? '…' : ''}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                  <span style={statBadge}>
                    <Image size={12} /> {p.image_count} images
                  </span>
                  <span style={statBadge}>
                    <Users size={12} /> {p.member_count} members
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ghostBtn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.15)',
  background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12,
  display: 'flex', alignItems: 'center', gap: 4,
};

const statBadge: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  fontSize: 12, color: 'rgba(255,255,255,0.4)',
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalBox: React.CSSProperties = {
  background: '#1a2535', border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 14, padding: '28px', width: 420,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
  background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
  color: '#e8edf2', outline: 'none', boxSizing: 'border-box', display: 'block',
};

const primaryBtn: React.CSSProperties = {
  flex: 1, padding: '9px', borderRadius: 8, border: 'none',
  background: '#1D9E75', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer',
};

const cancelBtn: React.CSSProperties = {
  flex: 1, padding: '9px', borderRadius: 8,
  border: '0.5px solid rgba(255,255,255,0.12)',
  background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer',
};
