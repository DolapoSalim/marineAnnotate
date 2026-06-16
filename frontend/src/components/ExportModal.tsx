import React, { useState } from 'react';
import { Download, X, AlertCircle, CheckCircle } from 'lucide-react';
import { exportApi } from '../api';

interface Props {
  batchId: number;
  batchName: string;
  onClose: () => void;
}

const FORMATS = [
  { id: 'yolo',     label: 'YOLO Detection',     desc: 'class cx cy w h (normalised). Use with: YOLOv8/v9/v11 train. Includes data.yaml.', ext: 'zip' },
  { id: 'yolo_seg', label: 'YOLO Segmentation',  desc: 'Polygon points (normalised). Use with: yolo segment train. For instance segmentation.', ext: 'zip' },
  { id: 'coco',     label: 'COCO JSON',           desc: 'Pixel-space bbox + segmentation. Use with: Detectron2, MMDetection, pycocotools.', ext: 'json' },
  { id: 'voc',      label: 'Pascal VOC',          desc: 'Pixel-space xmin/ymin/xmax/ymax XML. Includes label_map.pbtxt for TF Object Detection API.', ext: 'zip' },
  { id: 'csv',      label: 'CSV',                 desc: 'Normalised + pixel coords in one file. Use with: custom PyTorch/Keras Dataset classes.', ext: 'csv' },
];

export const ExportModal: React.FC<Props> = ({ batchId, batchName, onClose }) => {
  const [format, setFormat] = useState('yolo');
  const [includeAI, setIncludeAI] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);

  const selected = FORMATS.find(f => f.id === format)!;

  const handleDownload = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setDownloading(true);
    try {
      const res = await exportApi.export(batchId, format, includeAI);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${batchName.replace(/\s+/g, '_')}_annotations.${selected.ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(onClose, 1500);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#1a2535', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 460, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <Download size={18} style={{ color: '#1D9E75', marginRight: 10 }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Export annotations</span>
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
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Include AI toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 20 }}>
          <input type="checkbox" id="incAI" checked={includeAI} onChange={e => setIncludeAI(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
          <label htmlFor="incAI" style={{ fontSize: 13, cursor: 'pointer', flex: 1 }}>Include unreviewed AI suggestions</label>
        </div>

        {/* Confirmation prompt */}
        {confirmed && !done && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(239,159,39,0.1)', border: '0.5px solid rgba(239,159,39,0.3)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#EF9F27' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>Exporting as <strong>{selected.label}</strong>{includeAI ? ' including unreviewed AI suggestions' : ''}. Click Download again to confirm.</div>
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