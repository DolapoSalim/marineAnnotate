import React, { useState } from 'react';
import { Check, X, SkipForward, Bot, CheckCircle } from 'lucide-react';
import type { Annotation, AIReviewAction, LabelClass } from '../../types';
import { annotationsApi } from '../../api';

interface Props {
  imageId: number;
  annotations: Annotation[];
  labels: LabelClass[];
  onReviewComplete: () => void;
  onSelectAnnotation: (id: number) => void;
  selectedAnnotationId: number | null;
}

type ReviewState = {
  [annId: number]: { action: 'accept' | 'edit' | 'reject' | null; edited?: boolean };
};

export const AIReviewPanel: React.FC<Props> = ({
  imageId, annotations, labels, onReviewComplete, onSelectAnnotation, selectedAnnotationId,
}) => {
  const aiSuggestions = annotations.filter((a) => a.status === 'ai_suggestion');
  const [reviews, setReviews] = useState<ReviewState>({});
  const [saving, setSaving] = useState(false);

  if (aiSuggestions.length === 0) return null;

  const getLabelName = (id: number) => labels.find((l) => l.id === id)?.name || 'Unknown';
  const getLabelColor = (id: number) => labels.find((l) => l.id === id)?.color || '#EF9F27';

  const setAction = (annId: number, action: 'accept' | 'reject') => {
    setReviews((prev) => ({ ...prev, [annId]: { action } }));
  };

  const markEdited = (annId: number) => {
    setReviews((prev) => ({ ...prev, [annId]: { action: 'edit', edited: true } }));
  };

  const pendingCount = aiSuggestions.filter((a) => !reviews[a.id]?.action).length;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const actions: AIReviewAction[] = aiSuggestions.map((ann) => {
        const rev = reviews[ann.id];
        if (!rev?.action) return { annotation_id: ann.id, action: 'reject' };
        return { annotation_id: ann.id, action: rev.action };
      });
      await annotationsApi.review(imageId, actions);
      onReviewComplete();
    } catch (err) {
      console.error('Review failed', err);
    } finally {
      setSaving(false);
    }
  };

  const acceptAll = () => {
    const newReviews: ReviewState = {};
    aiSuggestions.forEach((a) => { newReviews[a.id] = { action: 'accept' }; });
    setReviews(newReviews);
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderLeft: '0.5px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Bot size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 500, fontSize: 14 }}>AI Predictions</span>
          <span style={{
            marginLeft: 'auto', fontSize: 11, padding: '2px 8px',
            background: 'rgba(239,159,39,0.15)', color: '#EF9F27',
            borderRadius: 20, fontWeight: 500,
          }}>
            {aiSuggestions.length} found
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Drag handles on canvas to edit, then accept.
        </div>
        {pendingCount === 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-success)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle size={13} /> All reviewed
          </div>
        )}
      </div>

      {/* Prediction list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {aiSuggestions.map((ann) => {
          const rev = reviews[ann.id];
          const isSelected = ann.id === selectedAnnotationId;
          const color = getLabelColor(ann.label_class_id);

          return (
            <div
              key={ann.id}
              onClick={() => onSelectAnnotation(ann.id)}
              style={{
                padding: '9px 16px',
                cursor: 'pointer',
                borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                background: isSelected ? 'var(--bg-hover)' : 'transparent',
                borderBottom: '0.5px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: color, flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, flex: 1 }}>{getLabelName(ann.label_class_id)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {ann.confidence ? `${Math.round(ann.confidence * 100)}%` : '—'}
                </span>
              </div>

              {/* Confidence bar */}
              <div style={{
                height: 3, background: 'var(--border)',
                borderRadius: 2, marginBottom: 8, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${(ann.confidence || 0) * 100}%`,
                  background: (ann.confidence || 0) >= 0.8 ? '#1D9E75'
                    : (ann.confidence || 0) >= 0.6 ? '#EF9F27' : '#E24B4A',
                  borderRadius: 2,
                }} />
              </div>

              {/* Status badge */}
              {rev?.action && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                    background: rev.action === 'accept' ? 'rgba(29,158,117,0.15)'
                      : rev.action === 'edit' ? 'rgba(83,74,183,0.15)'
                      : 'rgba(226,75,74,0.15)',
                    color: rev.action === 'accept' ? '#1D9E75'
                      : rev.action === 'edit' ? '#534AB7'
                      : '#E24B4A',
                  }}>
                    {rev.action === 'edit' ? 'edited' : rev.action === 'accept' ? 'accepted' : 'rejected'}
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setAction(ann.id, 'accept'); }}
                  style={{
                    flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                    border: '0.5px solid transparent', fontSize: 12, fontWeight: 500,
                    background: rev?.action === 'accept' ? 'rgba(29,158,117,0.2)' : 'var(--bg-hover)',
                    color: rev?.action === 'accept' ? '#1D9E75' : 'var(--text-muted)',
                  }}
                >
                  <Check size={12} style={{ display: 'inline', marginRight: 3 }} />
                  Accept
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                    markEdited(ann.id);
                  }}
                  style={{
                    flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                    border: '0.5px solid transparent', fontSize: 12, fontWeight: 500,
                    background: rev?.action === 'edit' ? 'rgba(83,74,183,0.2)' : 'var(--bg-hover)',
                    color: rev?.action === 'edit' ? '#534AB7' : 'var(--text-muted)',
                  }}
                >
                  ✎ Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setAction(ann.id, 'reject'); }}
                  style={{
                    flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                    border: '0.5px solid transparent', fontSize: 12, fontWeight: 500,
                    background: rev?.action === 'reject' ? 'rgba(226,75,74,0.15)' : 'var(--bg-hover)',
                    color: rev?.action === 'reject' ? '#E24B4A' : 'var(--text-muted)',
                  }}
                >
                  <X size={12} style={{ display: 'inline', marginRight: 3 }} />
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={acceptAll} style={{
          padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
          border: '0.5px solid var(--border)', background: 'transparent',
          color: 'var(--text-muted)',
        }}>
          Accept all
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            padding: '9px', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 500,
            border: 'none', background: '#1D9E75', color: '#fff',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : `Submit review (${aiSuggestions.length})`}
        </button>
      </div>
    </div>
  );
};