import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Shield, Eye, Edit3 } from 'lucide-react';
import { usersApi } from '../api';
import type { User, UserRole } from '../types';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'annotator' as UserRole });
  const navigate = useNavigate();

  useEffect(() => {
    usersApi.list().then((r) => setUsers(r.data));
  }, []);

  const createUser = async () => {
    if (!form.email || !form.full_name || !form.password) return;
    const res = await usersApi.create(form);
    setUsers((u) => [...u, res.data]);
    setShowCreate(false);
    setForm({ email: '', full_name: '', password: '', role: 'annotator' });
  };

  const toggleActive = async (user: User) => {
    const res = await usersApi.update(user.id, { is_active: !user.is_active });
    setUsers((u) => u.map((x) => (x.id === user.id ? res.data : x)));
  };

  const roleIcon = (role: UserRole) => {
    if (role === 'admin') return <Shield size={13} style={{ color: '#EF9F27' }} />;
    if (role === 'reviewer') return <Eye size={13} style={{ color: '#534AB7' }} />;
    return <Edit3 size={13} style={{ color: '#1D9E75' }} />;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f1923', color: '#e8edf2' }}>
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)', gap: 12,
      }}>
        <button onClick={() => navigate('/')} style={iconBtn}><ArrowLeft size={16} /></button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Admin Console</span>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Lab Members</h3>
          <button onClick={() => setShowCreate((v) => !v)} style={addBtn}>
            <UserPlus size={14} /> Create account
          </button>
        </div>

        {showCreate && (
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: 20, marginBottom: 20,
          }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 14 }}>New Account</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input placeholder="Full name" value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} style={inp} />
              <input placeholder="Email" type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={inp} />
              <input placeholder="Password (min 8 chars + digit)" type="password" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} style={inp} />
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))} style={inp}>
                <option value="annotator">Annotator</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setShowCreate(false)} style={cancelBtn}>Cancel</button>
              <button onClick={createUser} style={primaryBtn}>Create account</button>
            </div>
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              {['Name', 'Email', 'Role', 'Status', 'Last login', ''].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: u.avatar_color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 600, color: '#fff', flexShrink: 0,
                    }}>
                      {u.full_name[0]}
                    </div>
                    <span style={{ fontSize: 14 }}>{u.full_name}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 12px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{u.email}</td>
                <td style={{ padding: '12px 12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, textTransform: 'capitalize' }}>
                    {roleIcon(u.role)} {u.role}
                  </span>
                </td>
                <td style={{ padding: '12px 12px' }}>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 10,
                    background: u.is_active ? 'rgba(29,158,117,0.15)' : 'rgba(226,75,74,0.15)',
                    color: u.is_active ? '#1D9E75' : '#E24B4A',
                  }}>
                    {u.is_active ? 'active' : 'disabled'}
                  </span>
                </td>
                <td style={{ padding: '12px 12px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                  {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                </td>
                <td style={{ padding: '12px 12px' }}>
                  <button onClick={() => toggleActive(u)} style={{
                    padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    border: '0.5px solid rgba(255,255,255,0.12)',
                    background: 'transparent', color: 'rgba(255,255,255,0.5)',
                  }}>
                    {u.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7,
  border: '0.5px solid rgba(255,255,255,0.12)',
  background: 'transparent', color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const addBtn: React.CSSProperties = {
  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 7, border: 'none',
  background: '#1D9E75', color: '#fff', fontSize: 13, cursor: 'pointer',
};
const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 7, fontSize: 13,
  background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
  color: '#e8edf2', outline: 'none', width: '100%', boxSizing: 'border-box',
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
