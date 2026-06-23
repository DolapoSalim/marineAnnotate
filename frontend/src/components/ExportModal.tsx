import React, { useState } from 'react';
import { Download, X, AlertCircle, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { exportApi } from '../api';

interface Props {
  batchId: number;
  batchName: string;
  onClose: () => void;
}

const FORMATS = [
  { id: 'yolo',     label: 'YOLO Detection',     desc: 'class cx cy w h (normalised). Bundles images/train + images/val with labels/. Ready for: yolo train data=data.yaml', ext: 'zip', bundlesImages: true },
  { id: 'yolo_seg', label: 'YOLO Segmentation',  desc: 'Polygon points (normalised). Same image/label split structure. For: yolo segment train', ext: 'zip', bundlesImages: true },
  { id: 'coco',     label: 'COCO JSON',           desc: 'Pixel-space bbox + segmentation. Images bundled in images/. For: Detectron2, MMDetection, pycocotools', ext: 'zip', bundlesImages: true },
  { id: 'voc',      label: 'Pascal VOC',          desc: 'Pixel-space XML + label_map.pbtxt. Images bundled in images/. For: TF Object Detection API', ext: 'zip', bundlesImages: true },
  { id: 'csv',      label: 'CSV',                 desc: 'Normalised + pixel coords. Optionally bundles images/. For: custom PyTorch/Keras Dataset classes', ext: 'csv', bundlesImages: true },
];

export const ExportModal: React.FC<Props> = ({ batchId, batchName, onClose }) => {
  const [format, setFormat] = useState('yolo');
  const [includeAI, setIncludeAI] = useState(false);
  const [includeImages, setIncludeImages] = useState(true);
  const [valSplit, setValSplit] = useState(0.2);
  const [confirmed, setConfirmed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = FORMATS.find(f => f.id === format)!;
  const hasTrainValSplit = format === 'yolo' || format === 'yolo_seg';

  const handleDownload = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setDownloading(true);
    setError(null);
    try {
      const res = await exportApi.export(batchId, format, includeAI, includeImages, valSplit);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const ext = includeImages || format !== 'csv' ? 'zip' : selected.ext;
      a.download = `${batchName.replace(/\s+/g, '_')}_${format}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Export failed — please try again');
      setConfirmed(false);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#1a2535', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <Download size={18} style={{ color: '#1D9E75', marginRight: 10 }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Export dataset</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Batch: <span style={{ color: '#e8edf2' }}>{batchName}</span></div>

        {/* Format selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format</div>
          {FORMATS.map(f => (
            <div key={f.id} onClick={() => { setFormat(f.id); setConfirmed(false); }} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 6,
              border: format === f.id ? '0.5px solid #1D9E75' : '0.5px solid rgba(255,255,255,0.08)',
              background: format === f.id ? 'rgba(29,158,117,0.1)' : 'transparent',
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%', border: `2px solid ${format === f.id ? '#1D9E75' : 'rgba(255,255,255,0.2)'}`,
                background: format === f.id ? '#1D9E75' : 'transparent', flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {format === f.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{f.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Include images toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(29,158,117,0.06)', border: '0.5px solid rgba(29,158,117,0.2)', borderRadius: 8, marginBottom: 10 }}>
          <input type="checkbox" id="incImg" checked={includeImages} onChange={e => setIncludeImages(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
          <ImageIcon size={14} style={{ color: '#1D9E75' }} />
          <label htmlFor="incImg" style={{ fontSize: 13, cursor: 'pointer', flex: 1 }}>
            Bundle image files
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              Required for training — labels alone aren't enough to train a model
            </div>
          </label>
        </div>

        {/* Train/val split — only for YOLO formats */}
        {hasTrainValSplit && includeImages && (
          <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span>Validation split</span>
              <span style={{ color: '#1D9E75', fontWeight: 500 }}>{Math.round(valSplit * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={0.4} step={0.05} value={valSplit}
              onChange={e => setValSplit(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              Images are split deterministically into images/train and images/val folders
            </div>
          </div>
        )}

        {/* Include AI toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 20 }}>
          <input type="checkbox" id="incAI" checked={includeAI} onChange={e => setIncludeAI(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
          <label htmlFor="incAI" style={{ fontSize: 13, cursor: 'pointer', flex: 1 }}>Include unreviewed AI suggestions</label>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(226,75,74,0.1)', border: '0.5px solid rgba(226,75,74,0.3)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#f87171' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{error}</div>
          </div>
        )}

        {/* Confirmation prompt */}
        {confirmed && !done && !error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(239,159,39,0.1)', border: '0.5px solid rgba(239,159,39,0.3)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#EF9F27' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Exporting as <strong>{selected.label}</strong>
              {includeImages ? ', with images bundled' : ', labels only (no images)'}
              {includeAI ? ', including unreviewed AI suggestions' : ''}.
              Click Download again to confirm — this may take a moment for large batches.
            </div>
          </div>
        )}

        {done && (
          <div style={{ textAlign: 'center', color: '#1D9E75', fontSize: 14, marginBottom: 16, fontWeight: 500 }}>
            <CheckCircle size={16} style={{ display: 'inline', marginRight: 6 }} /> Download started!
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleDownload} disabled={downloading} style={{
            flex: 2, padding: '9px', borderRadius: 8, border: 'none', cursor: downloading ? 'not-allowed' : 'pointer',
            background: confirmed ? '#1D9E75' : 'rgba(29,158,117,0.2)',
            color: confirmed ? '#fff' : '#1D9E75', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.2s',
          }}>
            <Download size={14} />
            {downloading ? 'Preparing…' : confirmed ? 'Confirm download' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
};