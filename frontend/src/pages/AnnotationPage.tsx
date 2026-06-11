import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Square, Pentagon, MapPin, Tag, Hand,
  ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, Bot,
} from 'lucide-react';
import { imagesApi, annotationsApi, projectsApi } from '../api';
import { useCanvasStore, useProjectStore, useAuthStore } from '../store';
import { useProjectWebSocket } from '../hooks/useWebSocket';
import { AnnotationCanvas } from '../components/canvas/AnnotationCanvas';
import { AIReviewPanel } from '../components/sidebar/AIReviewPanel';
import type { Annotation, AnnotationImage, LabelClass, WSEvent } from '../types';

export const AnnotationPage: React.FC = () => {
  const { projectId, batchId } = useParams<{ projectId: string; batchId: string }>();
  const pid = Number(projectId);
  const bid = Number(batchId);
  const navigate = useNavigate();

  const [images, setImages] = useState<AnnotationImage[]>([]);
  const [imageIndex, setImageIndex] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAIPanel, setShowAIPanel] = useState(false);

  const { labels, setLabels, activeLabelId, setActiveLabel } = useProjectStore();
  const { tool, setTool, setZoom, zoom, resetCanvas, selectedAnnotationId } = useCanvasStore();
  const { user } = useAuthStore();

  // Load images + labels
  useEffect(() => {
    const load = async () => {
      const [imgRes, labelRes] = await Promise.all([
        imagesApi.list(bid),
        projectsApi.labels(pid),
      ]);
      setImages(imgRes.data);
      setLabels(labelRes.data);
      setLoading(false);
    };
    load();
  }, [bid, pid]);

  const currentImage = images[imageIndex] || null;

  // Load annotations when image changes
  useEffect(() => {
    if (!currentImage) return;
    annotationsApi.list(currentImage.id).then((r) => {
      setAnnotations(r.data);
      const hasAI = r.data.some((a: Annotation) => a.status === 'ai_suggestion');
      setShowAIPanel(hasAI);
    });
  }, [currentImage?.id]);

  // Real-time collaboration
  const handleWSEvent = useCallback((event: WSEvent) => {
    if (
      event.event === 'annotation_created' ||
      event.event === 'annotation_updated' ||
      event.event === 'annotation_deleted' ||
      event.event === 'ai_review_complete'
    ) {
      if (currentImage && event.data.image_id === currentImage.id) {
        annotationsApi.list(currentImage.id).then((r) => setAnnotations(r.data));
      }
    }
  }, [currentImage?.id]);

  useProjectWebSocket(pid, handleWSEvent);

  // Annotation CRUD
  const handleCreate = useCallback(async (partial: Partial<Annotation>) => {
    if (!currentImage || !activeLabelId) return;
    const res = await annotationsApi.create(currentImage.id, {
      ...partial,
      label_class_id: activeLabelId,
    });
    setAnnotations((a) => [...a, res.data]);
  }, [currentImage?.id, activeLabelId]);

  const handleUpdate = useCallback(async (id: number, changes: Partial<Annotation>) => {
    if (!currentImage) return;
    const res = await annotationsApi.update(currentImage.id, id, changes);
    setAnnotations((prev) => prev.map((a) => (a.id === id ? res.data : a)));
  }, [currentImage?.id]);

  const handleDelete = useCallback(async (id: number) => {
    if (!currentImage) return;
    await annotationsApi.delete(currentImage.id, id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, [currentImage?.id]);

  const handleReviewComplete = useCallback(() => {
    if (!currentImage) return;
    annotationsApi.list(currentImage.id).then((r) => {
      setAnnotations(r.data);
      setShowAIPanel(false);
    });
  }, [currentImage?.id]);

  const markComplete = async () => {
    if (!currentImage) return;
    await imagesApi.complete(currentImage.id);
    setImages((imgs) => imgs.map((img, i) => i === imageIndex ? { ...img, status: 'annotated' } : img));
    if (imageIndex < images.length - 1) setImageIndex((i) => i + 1);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'b') setTool('bbox');
      if (e.key === 'p') setTool('polygon');
      if (e.key === 'k') setTool('keypoint');
      if (e.key === 'v') setTool('select');
      if (e.key === 'h') setTool('pan');
      if (e.key === 'ArrowRight' && imageIndex < images.length - 1) setImageIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && imageIndex > 0) setImageIndex((i) => i - 1);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
        handleDelete(selectedAnnotationId);
      }
      if (e.key === '=' || e.key === '+') setZoom(zoom * 1.2);
      if (e.key === '-') setZoom(zoom * 0.8);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [imageIndex, images.length, selectedAnnotationId, zoom]);

  const toolButtons = [
    { key: 'select', icon: <Hand size={16} />, label: 'Select (V)' },
    { key: 'bbox', icon: <Square size={16} />, label: 'Bounding box (B)' },
    { key: 'polygon', icon: <Pentagon size={16} />, label: 'Polygon (P) · dbl-click to close' },
    { key: 'keypoint', icon: <MapPin size={16} />, label: 'Keypoint (K)' },
    { key: 'pan', icon: <Maximize2 size={16} />, label: 'Pan (H)' },
  ] as const;

  const hasAISuggestions = annotations.some((a) => a.status === 'ai_suggestion');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a1628', color: '#e8edf2' }}>
      {/* Top bar */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center', padding: '0 16px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)', gap: 12, flexShrink: 0,
        background: 'rgba(255,255,255,0.02)',
      }}>
        <button onClick={() => navigate(`/projects/${pid}`)} style={iconBtn}><ArrowLeft size={15} /></button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {currentImage?.filename || '…'}
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          {imageIndex + 1} / {images.length}
        </span>

        {/* Image nav */}
        <button onClick={() => setImageIndex((i) => Math.max(0, i - 1))} style={iconBtn} disabled={imageIndex === 0}>
          <ChevronLeft size={15} />
        </button>
        <button onClick={() => setImageIndex((i) => Math.min(images.length - 1, i + 1))} style={iconBtn} disabled={imageIndex === images.length - 1}>
          <ChevronRight size={15} />
        </button>

        <div style={{ flex: 1 }} />

        {hasAISuggestions && (
          <button onClick={() => setShowAIPanel((v) => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 7, border: '0.5px solid rgba(239,159,39,0.4)',
            background: showAIPanel ? 'rgba(239,159,39,0.15)' : 'transparent',
            color: '#EF9F27', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
            <Bot size={14} />
            AI review ({annotations.filter((a) => a.status === 'ai_suggestion').length})
          </button>
        )}

        <button onClick={markComplete} style={{
          padding: '6px 14px', borderRadius: 7, border: 'none',
          background: '#1D9E75', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}>
          Mark done →
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left toolbar */}
        <div style={{
          width: 48, flexShrink: 0, borderRight: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4,
          background: 'rgba(255,255,255,0.01)',
        }}>
          {toolButtons.map(({ key, icon, label }) => (
            <button
              key={key} onClick={() => setTool(key as any)} title={label}
              style={{
                width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: tool === key ? 'rgba(29,158,117,0.25)' : 'transparent',
                color: tool === key ? '#1D9E75' : 'rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {icon}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setZoom(zoom * 1.2)} style={iconToolBtn} title="Zoom in (+)"><ZoomIn size={15} /></button>
          <button onClick={() => setZoom(zoom * 0.8)} style={iconToolBtn} title="Zoom out (-)"><ZoomOut size={15} /></button>
          <button onClick={resetCanvas} style={iconToolBtn} title="Fit to screen"><Maximize2 size={15} /></button>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {currentImage ? (
            <AnnotationCanvas
              imageUrl={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${currentImage.image_url}`}
              imageWidth={currentImage.width}
              imageHeight={currentImage.height}
              annotations={annotations}
              onAnnotationCreate={handleCreate}
              onAnnotationUpdate={handleUpdate}
              onAnnotationSelect={(id) => useCanvasStore.getState().setSelectedAnnotation(id)}
            />
          ) : loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)' }}>
              Loading…
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)' }}>
              No images in this batch.
            </div>
          )}
        </div>

        {/* Right: label selector + annotation list */}
        <div style={{
          width: 220, flexShrink: 0, borderLeft: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
          background: 'rgba(255,255,255,0.01)',
        }}>
          {/* Label selector */}
          <div style={{ padding: '12px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Active label
            </div>
            {labels.map((lc) => (
              <div
                key={lc.id} onClick={() => setActiveLabel(lc.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                  borderRadius: 7, cursor: 'pointer', marginBottom: 3,
                  background: activeLabelId === lc.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: activeLabelId === lc.id ? `0.5px solid ${lc.color}40` : '0.5px solid transparent',
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: lc.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, flex: 1 }}>{lc.name}</span>
              </div>
            ))}
          </div>

          {/* Annotation list */}
          <div style={{ padding: '12px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Annotations ({annotations.filter((a) => a.status !== 'ai_rejected').length})
            </div>
            {annotations.filter((a) => a.status !== 'ai_rejected').map((ann) => {
              const lc = labels.find((l) => l.id === ann.label_class_id);
              const isAI = ann.status.startsWith('ai');
              return (
                <div
                  key={ann.id}
                  onClick={() => useCanvasStore.getState().setSelectedAnnotation(ann.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px',
                    borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                    background: selectedAnnotationId === ann.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: lc?.color || '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, flex: 1 }}>{lc?.name || '?'}</span>
                  {isAI && (
                    <span style={{ fontSize: 10, color: '#EF9F27' }}>AI</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(ann.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                  >×</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI review panel (slides in from right) */}
        {showAIPanel && (
          <div style={{ width: 280, flexShrink: 0, borderLeft: '0.5px solid rgba(239,159,39,0.2)' }}>
            <AIReviewPanel
              imageId={currentImage!.id}
              annotations={annotations}
              labels={labels}
              onReviewComplete={handleReviewComplete}
              onSelectAnnotation={(id) => useCanvasStore.getState().setSelectedAnnotation(id)}
              selectedAnnotationId={selectedAnnotationId}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{
        height: 26, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20,
        borderTop: '0.5px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.01)', fontSize: 11, color: 'rgba(255,255,255,0.3)',
        flexShrink: 0,
      }}>
        <span>Tool: <b style={{ color: 'rgba(255,255,255,0.55)' }}>{tool}</b></span>
        <span>Zoom: <b style={{ color: 'rgba(255,255,255,0.55)' }}>{Math.round(zoom * 100)}%</b></span>
        <span>Annotations: <b style={{ color: 'rgba(255,255,255,0.55)' }}>
          {annotations.filter((a) => a.status !== 'ai_rejected').length}
        </b></span>
        <span style={{ marginLeft: 'auto' }}>
          B=bbox · P=polygon · K=keypoint · V=select · ←→=navigate · Del=delete
        </span>
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

const iconToolBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'transparent', color: 'rgba(255,255,255,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
