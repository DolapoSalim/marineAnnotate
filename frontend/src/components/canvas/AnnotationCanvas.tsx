import React, { useCallback, useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import {
  Stage, Layer, Image as KonvaImage, Rect, Line, Circle, Group, Text,
} from 'react-konva';
import { useImageUrl } from '../../hooks/useImageUrl';
import type { Annotation, LabelClass, BBoxGeometry, PolygonGeometry } from '../../types';
import { useCanvasStore, useProjectStore } from '../../store';

interface Props {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  annotations: Annotation[];
  onAnnotationCreate: (ann: Partial<Annotation>) => void;
  onAnnotationUpdate: (id: number, changes: Partial<Annotation>) => void;
  onAnnotationSelect: (id: number | null) => void;
}

const HANDLE_RADIUS = 6;
const MIN_BOX_SIZE = 10;

export const AnnotationCanvas: React.FC<Props> = ({
  imageUrl,
  imageWidth: propWidth,
  imageHeight: propHeight,
  annotations,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationSelect,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [imageEl, setImageEl] = useState<HTMLImageElement | undefined>(undefined);
  const [imgSize, setImgSize] = useState({ w: propWidth || 800, h: propHeight || 600 });
  const [loadError, setLoadError] = useState(false);

  const blobUrl = useImageUrl(imageUrl || null);

  const {
    tool, zoom, panX, panY, selectedAnnotationId,
    isDrawing, drawingPoints,
    setZoom, setSelectedAnnotation, setDrawing, addDrawingPoint, clearDrawingPoints,
  } = useCanvasStore();
  const { labels, activeLabelId } = useProjectStore();

  // Load image from blob URL
  useEffect(() => {
    if (!blobUrl) { setImageEl(undefined); setLoadError(false); return; }
    const img = new window.Image();
    img.onload = () => {
      setImageEl(img);
      setLoadError(false);
      // Use actual image dimensions if props were 0
      if (!propWidth || !propHeight) {
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      } else {
        setImgSize({ w: propWidth, h: propHeight });
      }
    };
    img.onerror = () => setLoadError(true);
    img.src = blobUrl;
  }, [blobUrl, propWidth, propHeight]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const imageWidth = imgSize.w || 800;
  const imageHeight = imgSize.h || 600;

  const scale = Math.min(
    stageSize.width / imageWidth,
    stageSize.height / imageHeight,
  ) * zoom;

  const imgX = (stageSize.width - imageWidth * scale) / 2 + panX;
  const imgY = (stageSize.height - imageHeight * scale) / 2 + panY;

  const toNorm = useCallback((sx: number, sy: number) => ({
    x: (sx - imgX) / (imageWidth * scale),
    y: (sy - imgY) / (imageHeight * scale),
  }), [imgX, imgY, imageWidth, imageHeight, scale]);

  const labelById = (id: number) => labels.find((l) => l.id === id);

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === 'select' || tool === 'pan') return;
    const pos = stageRef.current!.getPointerPosition()!;
    const norm = toNorm(pos.x, pos.y);
    if (norm.x < 0 || norm.x > 1 || norm.y < 0 || norm.y > 1) return;
    if (tool === 'bbox') {
      setDrawing(true);
      addDrawingPoint(norm);
      addDrawingPoint(norm);
    } else if (tool === 'polygon' || tool === 'keypoint') {
      addDrawingPoint(norm);
      if (!isDrawing) setDrawing(true);
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || tool !== 'bbox') return;
    const pos = stageRef.current!.getPointerPosition()!;
    const norm = toNorm(pos.x, pos.y);
    useCanvasStore.setState((s) => {
      const pts = [...s.drawingPoints];
      pts[1] = norm;
      return { drawingPoints: pts };
    });
  };

  const handleStageMouseUp = () => {
    if (!isDrawing || tool !== 'bbox') return;
    if (drawingPoints.length < 2) { clearDrawingPoints(); return; }
    const [p1, p2] = drawingPoints;
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    if (w * imageWidth < MIN_BOX_SIZE || h * imageHeight < MIN_BOX_SIZE) {
      clearDrawingPoints(); return;
    }
    clearDrawingPoints();
    if (activeLabelId) {
      onAnnotationCreate({
        label_class_id: activeLabelId,
        annotation_type: 'bbox',
        geometry: { x, y, w, h },
        status: 'manual',
      });
    }
  };

  const handleStageDblClick = () => {
    if (tool !== 'polygon' || drawingPoints.length < 3) return;
    if (activeLabelId) {
      onAnnotationCreate({
        label_class_id: activeLabelId,
        annotation_type: 'polygon',
        geometry: { points: drawingPoints.map((p) => [p.x, p.y] as [number, number]) },
        status: 'manual',
      });
    }
    clearDrawingPoints();
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    setZoom(zoom * (e.evt.deltaY < 0 ? 1.1 : 0.9));
  };

  const renderBBox = (ann: Annotation) => {
    const g = ann.geometry as BBoxGeometry;
    const lc = labelById(ann.label_class_id);
    const color = lc?.color || '#EF9F27';
    const isSelected = ann.id === selectedAnnotationId;
    const isAI = ann.status === 'ai_suggestion';
    const x = imgX + g.x * imageWidth * scale;
    const y = imgY + g.y * imageHeight * scale;
    const w = g.w * imageWidth * scale;
    const h = g.h * imageHeight * scale;

    return (
      <Group key={ann.id} onClick={() => { setSelectedAnnotation(ann.id); onAnnotationSelect(ann.id); }}>
        <Rect x={x} y={y} width={w} height={h}
          stroke={color} strokeWidth={isSelected ? 2.5 : 1.5}
          dash={isAI ? [8, 4] : undefined}
          fill={isSelected ? `${color}22` : 'transparent'} />
        <Rect x={x} y={y - 20} width={Math.min(w, 160)} height={18} fill={color} cornerRadius={3} />
        <Text x={x + 4} y={y - 17}
          text={`${lc?.name || '?'}${ann.confidence ? ` · ${Math.round(ann.confidence * 100)}%` : ''}`}
          fontSize={11} fill="#fff" fontStyle="500" />
        {isSelected && [
          [x, y], [x + w / 2, y], [x + w, y],
          [x, y + h / 2], [x + w, y + h / 2],
          [x, y + h], [x + w / 2, y + h], [x + w, y + h],
        ].map(([hx, hy], i) => (
          <Circle key={i} x={hx} y={hy} radius={HANDLE_RADIUS}
            fill="#fff" stroke={color} strokeWidth={1.5} draggable
            onDragMove={(e) => {
              const np = toNorm(e.target.x(), e.target.y());
              const ng = { ...g };
              if (i === 0) { ng.w += ng.x - np.x; ng.x = np.x; ng.h += ng.y - np.y; ng.y = np.y; }
              if (i === 1) { ng.h += ng.y - np.y; ng.y = np.y; }
              if (i === 2) { ng.w = np.x - ng.x; ng.h += ng.y - np.y; ng.y = np.y; }
              if (i === 3) { ng.w += ng.x - np.x; ng.x = np.x; }
              if (i === 4) { ng.w = np.x - ng.x; }
              if (i === 5) { ng.w += ng.x - np.x; ng.x = np.x; ng.h = np.y - ng.y; }
              if (i === 6) { ng.h = np.y - ng.y; }
              if (i === 7) { ng.w = np.x - ng.x; ng.h = np.y - ng.y; }
              onAnnotationUpdate(ann.id, { geometry: ng });
            }} />
        ))}
      </Group>
    );
  };

  const renderPolygon = (ann: Annotation) => {
    const g = ann.geometry as PolygonGeometry;
    const lc = labelById(ann.label_class_id);
    const color = lc?.color || '#EF9F27';
    const isSelected = ann.id === selectedAnnotationId;
    const flatPts = g.points.flatMap(([px, py]) => [
      imgX + px * imageWidth * scale,
      imgY + py * imageHeight * scale,
    ]);
    return (
      <Group key={ann.id} onClick={() => { setSelectedAnnotation(ann.id); onAnnotationSelect(ann.id); }}>
        <Line points={flatPts} closed stroke={color}
          strokeWidth={isSelected ? 2.5 : 1.5}
          dash={ann.status === 'ai_suggestion' ? [8, 4] : undefined}
          fill={isSelected ? `${color}22` : `${color}11`} />
        {isSelected && g.points.map(([px, py], i) => (
          <Circle key={i}
            x={imgX + px * imageWidth * scale}
            y={imgY + py * imageHeight * scale}
            radius={HANDLE_RADIUS} fill="#fff" stroke={color} strokeWidth={1.5} draggable
            onDragMove={(e) => {
              const np = toNorm(e.target.x(), e.target.y());
              const newPts = [...g.points];
              newPts[i] = [np.x, np.y];
              onAnnotationUpdate(ann.id, { geometry: { points: newPts } });
            }} />
        ))}
      </Group>
    );
  };

  const renderDrawPreview = () => {
    if (!isDrawing || drawingPoints.length < 2) return null;
    if (tool === 'bbox') {
      const [p1, p2] = drawingPoints;
      return (
        <Rect
          x={imgX + Math.min(p1.x, p2.x) * imageWidth * scale}
          y={imgY + Math.min(p1.y, p2.y) * imageHeight * scale}
          width={Math.abs(p2.x - p1.x) * imageWidth * scale}
          height={Math.abs(p2.y - p1.y) * imageHeight * scale}
          stroke="#fff" strokeWidth={1.5} dash={[6, 3]} fill="rgba(255,255,255,0.08)" />
      );
    }
    if (tool === 'polygon') {
      return (
        <Line
          points={drawingPoints.flatMap(p => [
            imgX + p.x * imageWidth * scale,
            imgY + p.y * imageHeight * scale,
          ])}
          stroke="#fff" strokeWidth={1.5} dash={[6, 3]} />
      );
    }
    return null;
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0a1628', position: 'relative' }}>
      {/* Loading state */}
      {!imageEl && !loadError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          color: 'rgba(255,255,255,0.3)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '2px solid rgba(29,158,117,0.2)',
            borderTopColor: '#1D9E75',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 13 }}>Loading image…</span>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          color: 'rgba(255,255,255,0.3)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9l4-4 4 4 4-4 4 4"/>
            <circle cx="8.5" cy="13.5" r="1.5"/>
          </svg>
          <span style={{ fontSize: 13 }}>Failed to load image</span>
        </div>
      )}

      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handleStageDblClick}
        onWheel={handleWheel}
        style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
      >
        <Layer>
          {imageEl && (
            <KonvaImage
              image={imageEl}
              x={imgX} y={imgY}
              width={imageWidth * scale}
              height={imageHeight * scale}
            />
          )}
          {annotations.filter(a => a.status !== 'ai_rejected').map(ann => {
            if (ann.annotation_type === 'bbox') return renderBBox(ann);
            if (ann.annotation_type === 'polygon') return renderPolygon(ann);
            return null;
          })}
          {renderDrawPreview()}
        </Layer>
      </Stage>
    </div>
  );
};