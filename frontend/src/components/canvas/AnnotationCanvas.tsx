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
const POLY_CLOSE_THRESHOLD = 10; // px — click within this of first point closes the polygon

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

  // Live mouse position in image-normalised space, for polygon preview + close-snap
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Spacebar-held pan state
  const [spaceHeld, setSpaceHeld] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const blobUrl = useImageUrl(imageUrl || null);

  const {
    tool, zoom, panX, panY, selectedAnnotationId,
    isDrawing, drawingPoints,
    setZoom, setPan, setSelectedAnnotation, setDrawing, addDrawingPoint, clearDrawingPoints,
  } = useCanvasStore();
  const { labels, activeLabelId } = useProjectStore();

  // ── Load image ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!blobUrl) { setImageEl(undefined); setLoadError(false); return; }
    const img = new window.Image();
    img.onload = () => {
      setImageEl(img);
      setLoadError(false);
      if (!propWidth || !propHeight) {
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      } else {
        setImgSize({ w: propWidth, h: propHeight });
      }
    };
    img.onerror = () => setLoadError(true);
    img.src = blobUrl;
  }, [blobUrl, propWidth, propHeight]);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Spacebar hold-to-pan (works regardless of active tool) ───────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === 'Escape' && isDrawing) {
        clearDrawingPoints();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        isPanningRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isDrawing, clearDrawingPoints]);

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

  const toScreen = useCallback((nx: number, ny: number) => ({
    x: imgX + nx * imageWidth * scale,
    y: imgY + ny * imageHeight * scale,
  }), [imgX, imgY, imageWidth, imageHeight, scale]);

  const labelById = (id: number) => labels.find((l) => l.id === id);

  // Effective tool: holding space always pans, overriding the selected tool
  const effectiveTool = spaceHeld ? 'pan' : tool;

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current!.getPointerPosition()!;

    // Panning takes priority — spacebar held OR pan tool active
    if (effectiveTool === 'pan') {
      isPanningRef.current = true;
      panStartRef.current = { x: pos.x, y: pos.y, panX, panY };
      return;
    }

    if (effectiveTool === 'select') return;

    const norm = toNorm(pos.x, pos.y);

    if (effectiveTool === 'bbox') {
      setDrawing(true);
      addDrawingPoint(norm);
      addDrawingPoint(norm);
    } else if (effectiveTool === 'polygon') {
      // Check if clicking near the first point — closes the polygon
      if (drawingPoints.length >= 3) {
        const first = toScreen(drawingPoints[0].x, drawingPoints[0].y);
        const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
        if (dist < POLY_CLOSE_THRESHOLD) {
          commitPolygon();
          return;
        }
      }
      addDrawingPoint(norm);
      if (!isDrawing) setDrawing(true);
    } else if (effectiveTool === 'keypoint') {
      if (activeLabelId) {
        onAnnotationCreate({
          label_class_id: activeLabelId,
          annotation_type: 'keypoint',
          geometry: { points: [{ x: norm.x, y: norm.y, v: 2 }] },
          status: 'manual',
        });
      }
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current!.getPointerPosition();
    if (!pos) return;

    // Active panning
    if (isPanningRef.current) {
      const dx = pos.x - panStartRef.current.x;
      const dy = pos.y - panStartRef.current.y;
      setPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy);
      return;
    }

    const norm = toNorm(pos.x, pos.y);
    setMousePos(norm);

    if (isDrawing && tool === 'bbox') {
      useCanvasStore.setState((s) => {
        const pts = [...s.drawingPoints];
        pts[1] = norm;
        return { drawingPoints: pts };
      });
    }
  };

  const handleStageMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
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

  const commitPolygon = () => {
    if (drawingPoints.length < 3) return;
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

  const handleStageDblClick = () => {
    if (tool === 'polygon') commitPolygon();
  };

  // ── Wheel zoom — zooms toward cursor position ────────────────────────────
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = zoom;
    const delta = e.evt.deltaY < 0 ? 1.08 : 0.92;
    const newScale = Math.max(0.1, Math.min(10, oldScale * delta));

    // Keep the point under the cursor fixed while zooming
    const mousePointTo = {
      x: (pointer.x - imgX) / (imageWidth * (oldScale * (stageSize.width / imageWidth))) ,
    };
    // Simpler approach: adjust pan proportionally to zoom change centered on cursor
    const ratio = newScale / oldScale;
    const newPanX = pointer.x - (pointer.x - panX) * ratio;
    const newPanY = pointer.y - (pointer.y - panY) * ratio;

    setZoom(newScale);
    setPan(newPanX, newPanY);
  };

  // ── Render bbox ───────────────────────────────────────────────────────────
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

  // ── Render polygon ────────────────────────────────────────────────────────
  const renderPolygon = (ann: Annotation) => {
    const g = ann.geometry as PolygonGeometry;
    const lc = labelById(ann.label_class_id);
    const color = lc?.color || '#EF9F27';
    const isSelected = ann.id === selectedAnnotationId;
    const flatPts = g.points.flatMap(([px, py]) => {
      const s = toScreen(px, py);
      return [s.x, s.y];
    });
    return (
      <Group key={ann.id} onClick={() => { setSelectedAnnotation(ann.id); onAnnotationSelect(ann.id); }}>
        <Line points={flatPts} closed stroke={color}
          strokeWidth={isSelected ? 2.5 : 1.5}
          dash={ann.status === 'ai_suggestion' ? [8, 4] : undefined}
          fill={isSelected ? `${color}22` : `${color}11`}
          lineJoin="round" />
        {isSelected && g.points.map(([px, py], i) => {
          const s = toScreen(px, py);
          return (
            <Circle key={i} x={s.x} y={s.y}
              radius={HANDLE_RADIUS} fill="#fff" stroke={color} strokeWidth={1.5} draggable
              onDragMove={(e) => {
                const np = toNorm(e.target.x(), e.target.y());
                const newPts = [...g.points];
                newPts[i] = [np.x, np.y];
                onAnnotationUpdate(ann.id, { geometry: { points: newPts } });
              }} />
          );
        })}
      </Group>
    );
  };

  // ── Render keypoint ───────────────────────────────────────────────────────
  const renderKeypoint = (ann: Annotation) => {
    const geom = ann.geometry as any;
    const pts = geom.points || [];
    const lc = labelById(ann.label_class_id);
    const color = lc?.color || '#EF9F27';
    const isSelected = ann.id === selectedAnnotationId;
    return (
      <Group key={ann.id} onClick={() => { setSelectedAnnotation(ann.id); onAnnotationSelect(ann.id); }}>
        {pts.map((p: any, i: number) => {
          const s = toScreen(p.x, p.y);
          return (
            <Circle key={i} x={s.x} y={s.y} radius={isSelected ? 7 : 5}
              fill={color} stroke="#fff" strokeWidth={1.5} draggable
              onDragMove={(e) => {
                const np = toNorm(e.target.x(), e.target.y());
                const newPts = [...pts];
                newPts[i] = { ...p, x: np.x, y: np.y };
                onAnnotationUpdate(ann.id, { geometry: { points: newPts } });
              }} />
          );
        })}
      </Group>
    );
  };

  // ── Live draw preview ─────────────────────────────────────────────────────
  const renderDrawPreview = () => {
    if (tool === 'bbox' && isDrawing && drawingPoints.length >= 2) {
      const [p1, p2] = drawingPoints;
      const s1 = toScreen(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y));
      return (
        <Rect
          x={s1.x} y={s1.y}
          width={Math.abs(p2.x - p1.x) * imageWidth * scale}
          height={Math.abs(p2.y - p1.y) * imageHeight * scale}
          stroke="#fff" strokeWidth={1.5} dash={[6, 3]} fill="rgba(255,255,255,0.08)" />
      );
    }

    if (tool === 'polygon' && drawingPoints.length > 0) {
      const screenPts = drawingPoints.map(p => toScreen(p.x, p.y));
      const linePts = screenPts.flatMap(p => [p.x, p.y]);
      // Rubber-band line from last placed point to current mouse position
      const rubberBand = mousePos ? toScreen(mousePos.x, mousePos.y) : null;

      const firstPoint = screenPts[0];
      const nearClose = drawingPoints.length >= 3 && mousePos &&
        Math.hypot(
          toScreen(mousePos.x, mousePos.y).x - firstPoint.x,
          toScreen(mousePos.x, mousePos.y).y - firstPoint.y,
        ) < POLY_CLOSE_THRESHOLD;

      return (
        <>
          <Line
            points={rubberBand ? [...linePts, rubberBand.x, rubberBand.y] : linePts}
            stroke="#fff" strokeWidth={1.5} dash={[6, 3]}
            closed={false}
          />
          {screenPts.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={i === 0 && nearClose ? 8 : 4}
              fill={i === 0 && nearClose ? '#1D9E75' : '#fff'}
              stroke={i === 0 && nearClose ? '#fff' : '#1D9E75'}
              strokeWidth={1.5} />
          ))}
        </>
      );
    }

    return null;
  };

  // ── Cursor style ──────────────────────────────────────────────────────────
  const cursorStyle = effectiveTool === 'pan'
    ? (isPanningRef.current ? 'grabbing' : 'grab')
    : effectiveTool === 'select' ? 'default' : 'crosshair';

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0a1628', position: 'relative' }}>
      {!imageEl && !loadError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12, color: 'rgba(255,255,255,0.3)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '2px solid rgba(29,158,117,0.2)', borderTopColor: '#1D9E75',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 13 }}>Loading image…</span>
        </div>
      )}

      {loadError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.3)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9l4-4 4 4 4-4 4 4"/>
            <circle cx="8.5" cy="13.5" r="1.5"/>
          </svg>
          <span style={{ fontSize: 13 }}>Failed to load image</span>
        </div>
      )}

      {/* Pan hint */}
      {spaceHeld && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)',
          padding: '4px 12px', borderRadius: 20, fontSize: 11, zIndex: 5, pointerEvents: 'none',
        }}>
          Pan mode — drag to move
        </div>
      )}

      {/* Polygon hint */}
      {tool === 'polygon' && isDrawing && drawingPoints.length >= 3 && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(29,158,117,0.85)', color: '#fff',
          padding: '4px 12px', borderRadius: 20, fontSize: 11, zIndex: 5, pointerEvents: 'none',
        }}>
          Click first point or double-click to close · Esc to cancel
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
        style={{ cursor: cursorStyle }}
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
            if (ann.annotation_type === 'keypoint') return renderKeypoint(ann);
            return null;
          })}
          {renderDrawPreview()}
        </Layer>
      </Stage>
    </div>
  );
};