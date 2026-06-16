import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Edit3, Send, UserX, UserCheck, Clock, CheckCircle, XCircle, X } from 'lucide-react';
import { Logo } from '../components/ui/Logo.tsx';
import { usersApi, api } from '../api';
import { useAuthStore } from '../store';
import type { User, UserRole } from '../types';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'annotator' as UserRole });
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [sending, setSending] = useState(false);
  const { user: me } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => { usersApi.list().then(r => setUsers(r.data)); }, []);

  const sendInvite = async () => {
    if (!inviteForm.email || !inviteForm.full_name) return;
    setSending(true); setInviteStatus(null);
    try {
      await api.post('/api/invites/send', inviteForm);
      setInviteStatus({ type: 'success', msg: `Invite sent to ${inviteForm.email}` });
      setInviteForm({ email: '', full_name: '', role: 'annotator' });
      setShowInvite(false);
    } catch (err: any) {
      setInviteStatus({ type: 'error', msg: err.response?.data?.detail || 'Failed to send invite' });
    } finally { setSending(false); }
  };

  const toggleActive = async (u: User) => {
    const res = await usersApi.update(u.id, { is_active: !u.is_active });
    setUsers(prev => prev.map(x => x.id === u.id ? res.data : x));
  };

  const changeRole = async (u: User, role: UserRole) => {
    const res = await usersApi.update(u.id, { role });
    setUsers(prev => prev.map(x => x.id === u.id ? res.data : x));
  };

  const roleIcon = (role: UserRole) => {
    if (role === 'admin') return <Shield size={12} style={{ color: '#EF9F27' }} />;
    if (role === 'reviewer') return <Eye size={12} style={{ color: '#534AB7' }} />;
    return <Edit3 size={12} style={{ color: '#1D9E75' }} />;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a1220', color: '#e8edf2', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
        borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.015)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/')} style={iconBtn}><ArrowLeft size={15} /></button>
        <Logo size={24} showName={false} />
        <Shield size={16} style={{ color: '#EF9F27' }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Admin Console</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowInvite(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
          borderRadius: 8, border: 'none', background: '#1D9E75',
          color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500,
        }}>
          <Send size={13} /> Invite member
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>

        {/* Status banner */}
        {inviteStatus && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13,
            background: inviteStatus.type === 'success' ? 'rgba(29,158,117,0.15)' : 'rgba(226,75,74,0.15)',
            border: `0.5px solid ${inviteStatus.type === 'success' ? 'rgba(29,158,117,0.4)' : 'rgba(226,75,74,0.4)'}`,
            color: inviteStatus.type === 'success' ? '#1D9E75' : '#E24B4A',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {inviteStatus.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />} {inviteStatus.msg}
            <button onClick={() => setInviteStatus(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, display: 'flex' }}><X size={14} /></button>
          </div>
        )}

        {/* Invite panel */}
        {showInvite && (
          <div style={{
            background: 'rgba(29,158,117,0.06)', border: '0.5px solid rgba(29,158,117,0.2)',
            borderRadius: 14, padding: '20px', marginBottom: 24,
          }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Invite a lab member</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
              They will receive an email to set their own password. You will not see or set it.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: 10, marginBottom: 14 }}>
              <input
                placeholder="Full name" value={inviteForm.full_name}
                onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} style={inp}
              />
              <input
                placeholder="Email address" type="email" value={inviteForm.email}
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} style={inp}
              />
              <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as UserRole }))} style={inp}>
                <option value="annotator">Annotator</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowInvite(false)} style={cancelBtn}>Cancel</button>
              <button onClick={sendInvite} disabled={sending || !inviteForm.email || !inviteForm.full_name} style={{
                ...primaryBtn, opacity: (sending || !inviteForm.email || !inviteForm.full_name) ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Send size={13} /> {sending ? 'Sending…' : 'Send invite email'}
              </button>
            </div>
          </div>
        )}

        {/* Users table */}
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
          Lab Members <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400, fontSize: 13 }}>({users.length})</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {users.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 10, padding: '12px 16px',
              opacity: u.is_active ? 1 : 0.55,
            }}>
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: u.avatar_color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 600, color: '#fff', flexShrink: 0,
              }}>
                {u.full_name[0]?.toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{u.full_name}</span>
                  {u.id === me?.id && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(29,158,117,0.2)', color: '#1D9E75' }}>you</span>}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{u.email}</div>
              </div>

              {/* Role selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {roleIcon(u.role)}
                <select
                  value={u.role}
                  onChange={e => changeRole(u, e.target.value as UserRole)}
                  disabled={u.id === me?.id}
                  style={{ ...inp, padding: '4px 8px', fontSize: 12, width: 'auto', cursor: u.id === me?.id ? 'not-allowed' : 'pointer' }}
                >
                  <option value="annotator">Annotator</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Last login */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.3)', minWidth: 100 }}>
                <Clock size={11} />
                {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
              </div>

              {/* Status badge */}
              <div style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
                background: u.is_active ? 'rgba(29,158,117,0.15)' : 'rgba(107,114,128,0.15)',
                color: u.is_active ? '#1D9E75' : '#6B7280',
              }}>
                {u.is_active ? 'active' : 'disabled'}
              </div>

              {/* Toggle button — can't deactivate yourself */}
              {u.id !== me?.id && (
                <button onClick={() => toggleActive(u)} title={u.is_active ? 'Disable account' : 'Enable account'} style={{
                  width: 30, height: 30, borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)',
                  background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                </button>
              )}
            </div>
          ))}
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
const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 7, fontSize: 13,
  background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
  color: '#e8edf2', outline: 'none', width: '100%', boxSizing: 'border-box' as const,
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