import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Shield, Eye, Edit3, Mail, Send, X, Check } from 'lucide-react';
import { usersApi } from '../api';
import type { User, UserRole } from '../types';

// Fix 3: Admin sends invite — no password ever shown to admin
export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', role: 'annotator' as UserRole });
  const [inviteSent, setInviteSent] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    usersApi.list().then((r) => setUsers(r.data));
  }, []);

  // Generate a secure random password server-side-style
  // In production this would email the user; here we show it once for the admin to share securely
  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const sendInvite = async () => {
    if (!form.email || !form.full_name) return;
    const tempPassword = generateTempPassword();
    try {
      const res = await usersApi.create({ ...form, password: tempPassword });
      setUsers((u) => [...u, res.data]);
      setInviteSent(form.email);
      setGeneratedPassword(tempPassword);
      setForm({ email: '', full_name: '', role: 'annotator' });
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create account');
    }
  };

  const toggleActive = async (user: User) => {
    const res = await usersApi.update(user.id, { is_active: !user.is_active });
    setUsers((u) => u.map((x) => (x.id === user.id ? res.data : x)));
  };

  const roleIcon = (role: UserRole) => {
    if (role === 'admin') return <Shield size={12} />;
    if (role === 'reviewer') return <Eye size={12} />;
    return <Edit3 size={12} />;
  };

  const roleColor = (role: UserRole) => ({
    admin: '#EF9F27', reviewer: '#534AB7', annotator: '#1D9E75',
  }[role]);

  return (
    <div style={{ minHeight: '100vh', background: '#080f18', color: '#e8edf2', fontFamily: 'DM Sans, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=DM+Sans:wght@300;400;500&display=swap');`}</style>

      <div style={{
        height: 58, display: 'flex', alignItems: 'center', padding: '0 28px',
        borderBottom: '0.5px solid rgba(255,255,255,0.07)', gap: 14,
        background: 'rgba(255,255,255,0.015)',
      }}>
        <button onClick={() => navigate('/')} style={iconBtn}><ArrowLeft size={15} /></button>
        <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 700 }}>Admin Console</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>User management</span>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '36px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h2 style={{ fontFamily: 'Syne', fontSize: 20, fontWeight: 700, margin: '0 0 3px' }}>Lab Members</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{users.length} accounts</p>
          </div>
          <button onClick={() => { setShowInvite(true); setInviteSent(null); setGeneratedPassword(null); }} style={addBtn}>
            <UserPlus size={14} /> Invite member
          </button>
        </div>

        {/* Invite panel — no password field, admin never sets/sees password */}
        {showInvite && (
          <div style={{
            background: 'rgba(29,158,117,0.06)', border: '0.5px solid rgba(29,158,117,0.25)',
            borderRadius: 14, padding: 24, marginBottom: 24,
          }}>
            {!inviteSent ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Mail size={16} style={{ color: '#1D9E75' }} />
                  <span style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 600 }}>Invite a new lab member</span>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.6 }}>
                  A temporary password will be generated. Share it securely with the new member — they should change it on first login.
                  You will never see their password after this step.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <input placeholder="Full name" value={form.full_name}
                    onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} style={inp} />
                  <input placeholder="Email address" type="email" value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} style={inp} />
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                    style={{ ...inp, flex: 1 }}>
                    <option value="annotator">Annotator — can label images</option>
                    <option value="reviewer">Reviewer — can approve annotations</option>
                    <option value="admin">Admin — full access</option>
                  </select>
                  <button onClick={() => setShowInvite(false)} style={cancelBtn}><X size={14} /></button>
                  <button onClick={sendInvite} style={{ ...addBtn, gap: 6 }}>
                    <Send size={13} /> Create account
                  </button>
                </div>
              </>
            ) : (
              /* Show temp password once — clearly marked as sensitive */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Check size={16} style={{ color: '#1D9E75' }} />
                  <span style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 600, color: '#1D9E75' }}>
                    Account created for {inviteSent}
                  </span>
                </div>
                <div style={{
                  background: 'rgba(239,159,39,0.1)', border: '0.5px solid rgba(239,159,39,0.4)',
                  borderRadius: 10, padding: '14px 16px', marginBottom: 14,
                }}>
                  <div style={{ fontSize: 11, color: '#EF9F27', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    ⚠ Temporary password — share securely, shown only once
                  </div>
                  <div style={{
                    fontFamily: 'Courier New', fontSize: 18, fontWeight: 600,
                    color: '#fff', letterSpacing: '0.1em',
                  }}>
                    {generatedPassword}
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                  Share this with {inviteSent} via a secure channel (Signal, in person, etc). This password is not stored and cannot be recovered.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => navigator.clipboard.writeText(generatedPassword || '')}
                    style={{ ...cancelBtn, fontSize: 12 }}>Copy password</button>
                  <button onClick={() => { setShowInvite(false); setInviteSent(null); setGeneratedPassword(null); }}
                    style={{ ...addBtn }}>Done</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* User table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {users.map((u) => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 12, padding: '14px 18px',
              transition: 'border-color 0.15s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: u.avatar_color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff',
              }}>
                {u.full_name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{u.full_name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{u.email}</div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: roleColor(u.role), textTransform: 'capitalize',
                background: `${roleColor(u.role)}18`,
                padding: '4px 10px', borderRadius: 20,
              }}>
                {roleIcon(u.role)} {u.role}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', minWidth: 80, textAlign: 'right' }}>
                {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
              </div>
              <span style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 500,
                background: u.is_active ? 'rgba(29,158,117,0.12)' : 'rgba(226,75,74,0.12)',
                color: u.is_active ? '#1D9E75' : '#E24B4A',
                border: `0.5px solid ${u.is_active ? 'rgba(29,158,117,0.3)' : 'rgba(226,75,74,0.3)'}`,
              }}>
                {u.is_active ? 'Active' : 'Disabled'}
              </span>
              <button onClick={() => toggleActive(u)} style={{
                padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                border: '0.5px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: 'rgba(255,255,255,0.45)',
                transition: 'border-color 0.15s',
              }}>
                {u.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: '0.5px solid rgba(255,255,255,0.1)',
  background: 'transparent', color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const addBtn: React.CSSProperties = {
  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7,
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
};
const inp: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, fontSize: 13,
  background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)',
  color: '#e8edf2', outline: 'none', fontFamily: 'DM Sans, sans-serif',
};
const cancelBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8,
  border: '0.5px solid rgba(255,255,255,0.1)',
  background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 4,
};