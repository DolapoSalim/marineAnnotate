import React, { useState } from 'react';
import { Download, X, AlertCircle, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { exportApi } from '../api';

interface Props {
  batchId: number;
  batchName: string;
  onClose: () => void;
}

const FORMATS = [
  { id: 'yolo',     label: 'YOLO Detection',    desc: 'class cx cy w h (normalised). images/train|val|test + labels/. Ready for: yolo train data=data.yaml', ext: 'zip' },
  { id: 'yolo_seg', label: 'YOLO Segmentation', desc: 'Polygon points (normalised). Same folder structure. For: yolo segment train', ext: 'zip' },
  { id: 'coco',     label: 'COCO JSON',          desc: 'Pixel-space bbox + segmentation. For: Detectron2, MMDetection, pycocotools', ext: 'zip' },
  { id: 'voc',      label: 'Pascal VOC',         desc: 'Pixel-space XML + label_map.pbtxt. For: TF Object Detection API', ext: 'zip' },
  { id: 'csv',      label: 'CSV',                desc: 'Normalised + pixel coords. For: custom PyTorch / Keras Dataset loaders', ext: 'csv' },
];

export const ExportModal: React.FC<Props> = ({ batchId, batchName, onClose }) => {
  const [format, setFormat] = useState('yolo');
  const [includeAI, setIncludeAI] = useState(false);
  const [includeImages, setIncludeImages] = useState(true);
  const [trainPct, setTrainPct] = useState(70);
  const [valPct, setValPct]   = useState(20);
  const [testPct, setTestPct] = useState(10);
  const [confirmed, setConfirmed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = FORMATS.find(f => f.id === format)!;
  const hasThreeSplit = format === 'yolo' || format === 'yolo_seg';
  const total = trainPct + valPct + testPct;

  // Normalise to 0-1 summing to 1
  const splitConfig = {
    train: trainPct / 100,
    val:   valPct   / 100,
    test:  testPct  / 100,
  };

  const handleDownload = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setDownloading(true);
    setError(null);
    try {
      const res = await exportApi.export(batchId, format, includeAI, includeImages, splitConfig);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'csv' && !includeImages ? 'csv' : 'zip';
      a.download = `${batchName.replace(/\s+/g, '_')}_${format}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Export failed — please try again';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setConfirmed(false);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#1a2535', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <Download size={18} style={{ color: '#1D9E75', marginRight: 10 }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Export dataset</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>{batchName}</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Format selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format</div>
          {FORMATS.map(f => (
            <div key={f.id} onClick={() => { setFormat(f.id); setConfirmed(false); }} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 12px',
              borderRadius: 8, cursor: 'pointer', marginBottom: 5,
              border: format === f.id ? '0.5px solid #1D9E75' : '0.5px solid rgba(255,255,255,0.08)',
              background: format === f.id ? 'rgba(29,158,117,0.1)' : 'transparent',
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%', marginTop: 1, flexShrink: 0,
                border: `2px solid ${format === f.id ? '#1D9E75' : 'rgba(255,255,255,0.2)'}`,
                background: format === f.id ? '#1D9E75' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {format === f.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Include images */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(29,158,117,0.07)', border: '0.5px solid rgba(29,158,117,0.2)', borderRadius: 8, marginBottom: 10 }}>
          <input type="checkbox" id="incImg" checked={includeImages} onChange={e => setIncludeImages(e.target.checked)} style={{ cursor: 'pointer' }} />
          <ImageIcon size={14} style={{ color: '#1D9E75', flexShrink: 0 }} />
          <label htmlFor="incImg" style={{ fontSize: 13, cursor: 'pointer', flex: 1 }}>
            Bundle image files
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Required for training — labels alone can't train a model</div>
          </label>
        </div>

        {/* Train / Val / Test split — YOLO only */}
        {hasThreeSplit && includeImages && (
          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dataset split</div>
            {[
              { label: 'Train', value: trainPct, set: setTrainPct, color: '#1D9E75' },
              { label: 'Val',   value: valPct,   set: setValPct,   color: '#534AB7' },
              { label: 'Test',  value: testPct,  set: setTestPct,  color: '#EF9F27' },
            ].map(({ label, value, set, color }) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    {label}
                  </span>
                  <span style={{ color, fontWeight: 500 }}>{value}%</span>
                </div>
                <input type="range" min={0} max={90} step={5} value={value}
                  onChange={e => set(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
                />
              </div>
            ))}
            <div style={{ fontSize: 11, marginTop: 4, color: total === 100 ? '#1D9E75' : '#E24B4A', fontWeight: 500 }}>
              Total: {total}% {total !== 100 ? '— should add up to 100%' : '✓'}
            </div>
          </div>
        )}

        {/* Include unreviewed AI */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 20 }}>
          <input type="checkbox" id="incAI" checked={includeAI} onChange={e => setIncludeAI(e.target.checked)} style={{ cursor: 'pointer' }} />
          <label htmlFor="incAI" style={{ fontSize: 13, cursor: 'pointer' }}>Include unreviewed AI suggestions</label>
        </div>

        {/* Errors / confirmation / done */}
        {error && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'rgba(226,75,74,0.1)', border: '0.5px solid rgba(226,75,74,0.3)', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#f87171' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{error}</div>
          </div>
        )}

        {confirmed && !done && !error && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'rgba(239,159,39,0.1)', border: '0.5px solid rgba(239,159,39,0.3)', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#EF9F27' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Exporting as <strong>{selected.label}</strong>
              {includeImages ? ' with images bundled' : ' (labels only)'}
              {includeAI ? ', including unreviewed AI' : ''}.
              Large batches may take a moment. Click Download to confirm.
            </div>
          </div>
        )}

        {done && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: '#1D9E75', fontSize: 14, marginBottom: 14, fontWeight: 500 }}>
            <CheckCircle size={16} /> Download started!
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || (hasThreeSplit && total !== 100)}
            style={{
              flex: 2, padding: '9px', borderRadius: 8, border: 'none',
              background: (hasThreeSplit && total !== 100) ? 'rgba(255,255,255,0.1)' : confirmed ? '#1D9E75' : 'rgba(29,158,117,0.2)',
              color: (hasThreeSplit && total !== 100) ? 'rgba(255,255,255,0.3)' : confirmed ? '#fff' : '#1D9E75',
              fontSize: 13, fontWeight: 500, cursor: downloading || (hasThreeSplit && total !== 100) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Download size={14} />
            {downloading ? 'Preparing…'
              : (hasThreeSplit && total !== 100) ? 'Fix split to 100%'
              : confirmed ? 'Confirm download'
              : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
};
