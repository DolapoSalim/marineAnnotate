import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, CheckCircle, Clock, Eye, AlertCircle, RotateCcw } from 'lucide-react';
import { imagesApi, projectsApi } from '../api';
import type { AnnotationImage, ImageBatch } from '../types';

const STATUS_META = {
  pending:     { label: 'Pending',     color: '#6B7280', bg: 'rgba(107,114,128,0.15)', icon: Clock },
  in_progress: { label: 'In Progress', color: '#EF9F27', bg: 'rgba(239,159,39,0.15)',  icon: Eye },
  annotated:   { label: 'Annotated',   color: '#1D9E75', bg: 'rgba(29,158,117,0.15)',  icon: CheckCircle },
  reviewed:    { label: 'Reviewed',    color: '#534AB7', bg: 'rgba(83,74,183,0.15)',   icon: CheckCircle },
  skipped:     { label: 'Skipped',     color: '#E24B4A', bg: 'rgba(226,75,74,0.15)',  icon: AlertCircle },
};

export const ImageGalleryPage: React.FC = () => {
  const { projectId, batchId } = useParams<{ projectId: string; batchId: string }>();
  const pid = Number(projectId);
  const bid = Number(batchId);
  const navigate = useNavigate();

  const [images, setImages] = useState<AnnotationImage[]>([]);
  const [batch, setBatch] = useState<ImageBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const [imgRes, batchesRes] = await Promise.all([
        imagesApi.list(bid, 0, 200),
        projectsApi.batches(pid),
      ]);
      setImages(imgRes.data);
      const b = batchesRes.data.find((x: ImageBatch) => x.id === bid);
      setBatch(b || null);
      setLoading(false);
    };
    load();
  }, [bid, pid]);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    setUploadProgress(0);
    await imagesApi.upload(bid, Array.from(files), setUploadProgress);
    const res = await imagesApi.list(bid, 0, 200);
    setImages(res.data);
    setUploading(false);
  };

  const filteredImages = filter === 'all'
    ? images
    : images.filter(img => img.status === filter);

  const stats = {
    total: images.length,
    pending: images.filter(i => i.status === 'pending').length,
    in_progress: images.filter(i => i.status === 'in_progress').length,
    annotated: images.filter(i => i.status === 'annotated').length,
    reviewed: images.filter(i => i.status === 'reviewed').length,
  };

  const pct = stats.total > 0 ? Math.round((stats.annotated + stats.reviewed) / stats.total * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0a1220', color: '#e8edf2', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
        borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.015)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate(`/projects/${pid}`)} style={iconBtn}><ArrowLeft size={15} /></button>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{batch?.name || 'Image Gallery'}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{stats.total} images</div>
        </div>
        <div style={{ flex: 1 }} />
        <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
          onChange={e => e.target.files && handleUpload(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} style={uploadBtn}>
          <Upload size={14} /> Upload images
        </button>
        <button
          onClick={() => navigate(`/projects/${pid}/batches/${bid}/annotate`)}
          style={{ ...uploadBtn, background: '#1D9E75' }}
        >
          Start annotating →
        </button>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {/* Progress bar */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>Batch progress</span>
              <span style={{ color: '#1D9E75', fontWeight: 600 }}>{pct}% annotated</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,#1D9E75,#34d399)', width: `${pct}%`, borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
          </div>
          {/* Status counts */}
          {Object.entries(stats).filter(([k]) => k !== 'total').map(([status, count]) => {
            const meta = STATUS_META[status as keyof typeof STATUS_META];
            if (!meta) return null;
            return (
              <div key={status} style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: meta.color }}>{count}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{meta.label}</div>
              </div>
            );
          })}
        </div>

        {/* Upload progress */}
        {uploading && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(29,158,117,0.1)', borderRadius: 8, border: '0.5px solid rgba(29,158,117,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>Uploading…</span><span style={{ color: '#1D9E75' }}>{uploadProgress}%</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <div style={{ height: '100%', background: '#1D9E75', width: `${uploadProgress}%`, borderRadius: 2, transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {['all', 'pending', 'in_progress', 'annotated', 'reviewed', 'skipped'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: 500,
              border: filter === s ? 'none' : '0.5px solid rgba(255,255,255,0.12)',
              background: filter === s
                ? (s === 'all' ? '#1D9E75' : (STATUS_META[s as keyof typeof STATUS_META]?.bg || '#1D9E75'))
                : 'transparent',
              color: filter === s
                ? (s === 'all' ? '#fff' : (STATUS_META[s as keyof typeof STATUS_META]?.color || '#fff'))
                : 'rgba(255,255,255,0.5)',
            }}>
              {s === 'all' ? `All (${stats.total})` : `${STATUS_META[s as keyof typeof STATUS_META]?.label} (${stats[s as keyof typeof stats] ?? 0})`}
            </button>
          ))}
        </div>

        {/* Image grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
        ) : filteredImages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.3)' }}>
            <Upload size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div>{filter === 'all' ? 'No images yet — upload some above' : `No ${filter} images`}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {filteredImages.map(img => {
              const meta = STATUS_META[img.status as keyof typeof STATUS_META] || STATUS_META.pending;
              const StatusIcon = meta.icon;
              const isSelected = selected === img.id;
              return (
                <div
                  key={img.id}
                  onClick={() => setSelected(isSelected ? null : img.id)}
                  onDoubleClick={() => navigate(`/projects/${pid}/batches/${bid}/annotate?image=${img.id}`)}
                  style={{
                    borderRadius: 10, overflow: 'hidden', cursor: 'pointer', position: 'relative',
                    border: isSelected ? `2px solid ${meta.color}` : '0.5px solid rgba(255,255,255,0.08)',
                    background: '#111b2a',
                    transition: 'transform 0.15s, border-color 0.15s',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{ width: '100%', paddingBottom: '75%', position: 'relative', background: '#0a1220' }}>
                    <img
                      src={`/api/images/${img.id}/thumbnail`}
                      alt={img.filename}
                      style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        objectFit: 'cover',
                      }}
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {/* Status badge */}
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      background: meta.bg, border: `0.5px solid ${meta.color}40`,
                      borderRadius: 20, padding: '3px 8px',
                      display: 'flex', alignItems: 'center', gap: 4,
                      backdropFilter: 'blur(8px)',
                    }}>
                      <StatusIcon size={10} style={{ color: meta.color }} />
                      <span style={{ fontSize: 10, color: meta.color, fontWeight: 500 }}>{meta.label}</span>
                    </div>
                    {/* Annotation count */}
                    {img.annotation_count > 0 && (
                      <div style={{
                        position: 'absolute', bottom: 8, left: 8,
                        background: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: '2px 8px',
                        fontSize: 10, color: 'rgba(255,255,255,0.8)',
                      }}>
                        {img.annotation_count} annotations
                      </div>
                    )}
                  </div>

                  {/* Info row */}
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {img.filename}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      {img.width}×{img.height}
                    </div>
                  </div>

                  {/* Selected overlay actions */}
                  {isSelected && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                      padding: '20px 10px 10px', display: 'flex', gap: 6,
                    }}>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/projects/${pid}/batches/${bid}/annotate?image=${img.id}`); }}
                        style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}
                      >
                        Annotate
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.12)',
  background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const uploadBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)', color: '#e8edf2',
  fontSize: 13, cursor: 'pointer', fontWeight: 500,
};
