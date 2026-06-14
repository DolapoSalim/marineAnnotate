import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Plus, Bot, Download, Users } from 'lucide-react';
import { ExportModal } from '../components/ExportModal';
import { projectsApi, imagesApi, exportApi } from '../api';
import { useProjectStore } from '../store';
import type { Project, ImageBatch, LabelClass, MLModel, AIJob } from '../types';

export const ProjectPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const navigate = useNavigate();
  const { setProject, setLabels } = useProjectStore();

  const [project, setProjectData] = useState<Project | null>(null);
  const [batches, setBatches] = useState<ImageBatch[]>([]);
  const [labels, setLabelsLocal] = useState<LabelClass[]>([]);
  const [models, setModels] = useState<MLModel[]>([]);
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const [tab, setTab] = useState<'batches' | 'labels' | 'models' | 'members'>('batches');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New batch / label / model forms
  const [newBatchName, setNewBatchName] = useState('');
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#1D9E75');
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [exportBatch, setExportBatch] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    setProject(id);
    projectsApi.get(id).then((r) => setProjectData(r.data));
    projectsApi.batches(id).then((r) => setBatches(r.data));
    projectsApi.labels(id).then((r) => { setLabelsLocal(r.data); setLabels(r.data); });
    projectsApi.models(id).then((r) => setModels(r.data));
    projectsApi.jobs(id).then((r) => setJobs(r.data));
  }, [id]);

  const createBatch = async () => {
    if (!newBatchName.trim()) return;
    const res = await projectsApi.createBatch(id, { name: newBatchName });
    setBatches((b) => [...b, res.data]);
    setShowNewBatch(false);
    setNewBatchName('');
  };

  const createLabel = async () => {
    if (!newLabelName.trim()) return;
    const res = await projectsApi.createLabel(id, {
      name: newLabelName, color: newLabelColor,
      annotation_type: 'bbox',
    });
    const updated = [...labels, res.data];
    setLabelsLocal(updated);
    setLabels(updated);
    setShowNewLabel(false);
    setNewLabelName('');
  };

  const uploadImages = async (batchId: number, files: FileList) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      await imagesApi.upload(batchId, Array.from(files), setUploadProgress);
      const res = await projectsApi.batches(id);
      setBatches(res.data);
    } finally {
      setUploading(false);
    }
  };

  const runInference = async (modelId: number, batchId: number) => {
    const res = await projectsApi.createJob(id, {
      model_id: modelId, batch_id: batchId,
      job_type: 'inference', confidence_threshold: 0.5,
    });
    setJobs((j) => [res.data, ...j]);
  };

  const downloadExport = async (batchId: number, format: string) => {
    const res = await exportApi.export(batchId, format);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations.${format === 'coco' ? 'json' : 'zip'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = ['batches', 'labels', 'models', 'members'] as const;

  return (
    <div style={{ minHeight: '100vh', background: '#0f1923', color: '#e8edf2' }}>
      {/* Header */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)', gap: 12,
      }}>
        <button onClick={() => navigate('/')} style={iconBtn}><ArrowLeft size={16} /></button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{project?.name || '…'}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
          {project?.description}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 24px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '12px 16px', background: 'transparent', border: 'none',
            cursor: 'pointer', fontSize: 13, fontWeight: 500, textTransform: 'capitalize',
            color: tab === t ? '#1D9E75' : 'rgba(255,255,255,0.45)',
            borderBottom: tab === t ? '2px solid #1D9E75' : '2px solid transparent',
          }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 24px' }}>

        {/* ── Batches tab ── */}
        {tab === 'batches' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Image Batches</h3>
              <button onClick={() => setShowNewBatch(true)} style={addBtn}><Plus size={14} /> New batch</button>
            </div>
            {showNewBatch && (
              <div style={inlineForm}>
                <input value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)}
                  placeholder="Batch name" style={inputSm} autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createBatch()}
                />
                <button onClick={createBatch} style={smPrimary}>Create</button>
                <button onClick={() => setShowNewBatch(false)} style={smCancel}>Cancel</button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {batches.map((b) => (
                <div key={b.id} style={batchCard}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {b.image_count} images · {b.annotated_count} annotated
                      {b.image_count > 0 && (
                        <span style={{ marginLeft: 8 }}>
                          ({Math.round((b.annotated_count / b.image_count) * 100)}% done)
                        </span>
                      )}
                    </div>
                    {b.image_count > 0 && (
                      <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                        <div style={{
                          height: '100%', borderRadius: 2, background: '#1D9E75',
                          width: `${Math.round((b.annotated_count / b.image_count) * 100)}%`,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Upload */}
                    <input
                      ref={fileInputRef} type="file" multiple accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => e.target.files && uploadImages(b.id, e.target.files)}
                    />
                    <button onClick={() => { setActiveBatchId(b.id); fileInputRef.current?.click(); }} style={iconBtn}>
                      <Upload size={14} />
                    </button>
                    {/* Annotate */}
                    <button onClick={() => navigate(`/projects/${id}/batches/${b.id}/gallery`)} style={smPrimary}>
                      Annotate
                    </button>
                    {/* Run AI */}
                    {models.length > 0 && (
                      <button onClick={() => runInference(models[0].id, b.id)} style={{ ...smPrimary, background: '#534AB7' }}>
                        <Bot size={13} style={{ display: 'inline', marginRight: 4 }} />
                        AI assist
                      </button>
                    )}
                    {/* Export */}
                    <button
                      onClick={() => setExportBatch({ id: b.id, name: b.name })}
                      style={{ ...iconBtn, color: '#1D9E75', borderColor: 'rgba(29,158,117,0.3)' }}
                      title="Export annotations"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {batches.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0' }}>
                  No batches yet.
                </div>
              )}
            </div>
            {uploading && (
              <div style={{ marginTop: 16, fontSize: 13, color: '#1D9E75' }}>
                Uploading… {uploadProgress}%
                <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ height: '100%', background: '#1D9E75', width: `${uploadProgress}%`, borderRadius: 2 }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Labels tab ── */}
        {tab === 'labels' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Label Classes</h3>
              <button onClick={() => setShowNewLabel(true)} style={addBtn}><Plus size={14} /> Add class</button>
            </div>
            {showNewLabel && (
              <div style={inlineForm}>
                <input value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Class name" style={inputSm} autoFocus />
                <input type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)}
                  style={{ width: 36, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 2 }} />
                <button onClick={createLabel} style={smPrimary}>Add</button>
                <button onClick={() => setShowNewLabel(false)} style={smCancel}>Cancel</button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {labels.map((lc) => (
                <div key={lc.id} style={{ ...batchCard, padding: '12px 16px' }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: lc.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{lc.name}</div>
                    {lc.supercategory && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{lc.supercategory}</div>}
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>
                    {lc.annotation_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Models tab ── */}
        {tab === 'models' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>ML Models</h3>
            </div>
            <div style={{ marginBottom: 24 }}>
              <ModelUploadForm projectId={id} onUploaded={(m) => setModels((prev) => [...prev, m])} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {models.map((m) => (
                <div key={m.id} style={batchCard}>
                  <Bot size={18} style={{ color: '#534AB7', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {m.model_type} · uploaded {new Date(m.uploaded_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10, background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>
                    active
                  </span>
                </div>
              ))}
            </div>

            {jobs.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Recent AI Jobs</h4>
                {jobs.map((j) => (
                  <div key={j.id} style={{ ...batchCard, marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      Batch #{j.batch_id} · {j.job_type}
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        {new Date(j.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 10,
                      background: j.status === 'done' ? 'rgba(29,158,117,0.15)'
                        : j.status === 'failed' ? 'rgba(226,75,74,0.15)'
                        : 'rgba(239,159,39,0.15)',
                      color: j.status === 'done' ? '#1D9E75' : j.status === 'failed' ? '#E24B4A' : '#EF9F27',
                    }}>
                      {j.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Members tab ── */}
        {tab === 'members' && <MembersTab projectId={id} />}

      {/* Export modal */}
      {exportBatch && (
        <ExportModal
          batchId={exportBatch.id}
          batchName={exportBatch.name}
          onClose={() => setExportBatch(null)}
        />
      )}
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const ModelUploadForm: React.FC<{ projectId: number; onUploaded: (m: MLModel) => void }> = ({ projectId, onUploaded }) => {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [classMapping, setClassMapping] = useState('{"0": 1}');
  const [uploading, setUploading] = useState(false);

  const upload = async () => {
    if (!file || !name.trim()) return;
    setUploading(true);
    const form = new FormData();
    form.append('name', name);
    form.append('file', file);
    form.append('class_mapping', classMapping);
    try {
      const res = await projectsApi.uploadModel(projectId, form);
      onUploaded(res.data);
      setName(''); setFile(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(83,74,183,0.08)', border: '0.5px solid rgba(83,74,183,0.25)',
      borderRadius: 10, padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: '#a09de8' }}>
        Upload trained model (.pt)
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Model name" style={{ ...inputSm, flex: 1 }} />
        <input type="file" accept=".pt,.pth" onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ ...inputSm, flex: 1 }} />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
        Class mapping (YOLO class_id → label_class_id):
      </div>
      <input value={classMapping} onChange={(e) => setClassMapping(e.target.value)}
        style={{ ...inputSm, width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
      <button onClick={upload} disabled={uploading || !file || !name}
        style={{ ...smPrimary, marginTop: 12, background: '#534AB7', opacity: uploading ? 0.6 : 1 }}>
        {uploading ? 'Uploading…' : 'Upload model'}
      </button>
    </div>
  );
};

const MembersTab: React.FC<{ projectId: number }> = ({ projectId }) => {
  const [members, setMembers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');

  useEffect(() => {
    projectsApi.members(projectId).then((r) => setMembers(r.data));
    import('../api').then(({ usersApi }) => usersApi.list().then((r) => setUsers(r.data)));
  }, [projectId]);

  const addMember = async () => {
    if (!selectedUser) return;
    const res = await projectsApi.addMember(projectId, { user_id: Number(selectedUser), role: 'annotator' });
    setMembers((m) => [...m, res.data]);
    setSelectedUser('');
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 20px', fontSize: 16 }}>Team Members</h3>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
          style={{ ...inputSm, flex: 1 }}>
          <option value="">Select user to add…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
        </select>
        <button onClick={addMember} style={smPrimary}>Add</button>
      </div>
      {members.map((m) => (
        <div key={m.id} style={{ ...batchCard, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: m.user?.avatar_color || '#1D9E75',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600, color: '#fff',
          }}>
            {m.user?.full_name?.[0] || '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{m.user?.full_name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{m.user?.email}</div>
          </div>
          <span style={{ fontSize: 11, textTransform: 'capitalize', color: 'rgba(255,255,255,0.4)' }}>{m.role}</span>
        </div>
      ))}
    </div>
  );
};

// Shared styles
const batchCard: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
  background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)',
  borderRadius: 10, padding: '14px 16px',
};
const addBtn: React.CSSProperties = {
  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 7, border: 'none',
  background: '#1D9E75', color: '#fff', fontSize: 13, cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.12)',
  background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const inlineForm: React.CSSProperties = {
  display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center',
};
const inputSm: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 7, fontSize: 13,
  background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
  color: '#e8edf2', outline: 'none',
};
const smPrimary: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 7, border: 'none',
  background: '#1D9E75', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500,
  display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
};
const smCancel: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
  border: '0.5px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)',
};