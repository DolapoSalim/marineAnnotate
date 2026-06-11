import React, { useCallback, useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import {
  Stage, Layer, Image as KonvaImage, Rect, Line, Circle, Group, Text,
} from 'react-konva';
import useImage from 'use-image';
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
  imageWidth,
  imageHeight,
  annotations,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationSelect,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  const { tool, zoom, panX, panY, selectedAnnotationId,
          isDrawing, drawingPoints,
          setZoom, setPan, setDrawing, addDrawingPoint,
          clearDrawingPoints, setSelectedAnnotation } = useCanvasStore();
  const { labels, activeLabelId } = useProjectStore();

  const [image] = useImage(imageUrl, 'anonymous');

  // Fit image to stage on load
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

  const scale = Math.min(
    stageSize.width / imageWidth,
    stageSize.height / imageHeight,
  ) * zoom;

  const imgX = (stageSize.width - imageWidth * scale) / 2 + panX;
  const imgY = (stageSize.height - imageHeight * scale) / 2 + panY;

  // Convert stage coords → normalised image coords
  const toNorm = useCallback((sx: number, sy: number) => ({
    x: (sx - imgX) / (imageWidth * scale),
    y: (sy - imgY) / (imageHeight * scale),
  }), [imgX, imgY, imageWidth, imageHeight, scale]);

  const labelById = (id: number): LabelClass | undefined => labels.find((l) => l.id === id);

  // ── Stage events ────────────────────────────────────────────────────────────
  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === 'select' || tool === 'pan') return;
    const pos = stageRef.current!.getPointerPosition()!;
    const norm = toNorm(pos.x, pos.y);
    if (norm.x < 0 || norm.x > 1 || norm.y < 0 || norm.y > 1) return;

    if (tool === 'bbox') {
      setDrawing(true);
      addDrawingPoint(norm);
      addDrawingPoint(norm); // second point tracks mouse
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
    onAnnotationCreate({
      label_class_id: activeLabelId!,
      annotation_type: 'bbox',
      geometry: { x, y, w, h },
      status: 'manual',
    });
  };

  const handleStageDblClick = () => {
    if (tool !== 'polygon' || drawingPoints.length < 3) return;
    onAnnotationCreate({
      label_class_id: activeLabelId!,
      annotation_type: 'polygon',
      geometry: { points: drawingPoints.map((p) => [p.x, p.y] as [number, number]) },
      status: 'manual',
    });
    clearDrawingPoints();
  };

  // ── Wheel zoom ───────────────────────────────────────────────────────────────
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const delta = e.evt.deltaY < 0 ? 1.1 : 0.9;
    setZoom(zoom * delta);
  };

  // ── Render annotations ───────────────────────────────────────────────────────
  const renderBBox = (ann: Annotation) => {
    const g = ann.geometry as BBoxGeometry;
    const lc = labelById(ann.label_class_id);
    const color = lc?.color || '#EF9F27';
    const isSelected = ann.id === selectedAnnotationId;
    const isAiSuggestion = ann.status === 'ai_suggestion';
    const x = imgX + g.x * imageWidth * scale;
    const y = imgY + g.y * imageHeight * scale;
    const w = g.w * imageWidth * scale;
    const h = g.h * imageHeight * scale;

    return (
      <Group key={ann.id} onClick={() => { setSelectedAnnotation(ann.id); onAnnotationSelect(ann.id); }}>
        <Rect
          x={x} y={y} width={w} height={h}
          stroke={color}
          strokeWidth={isSelected ? 2.5 : 1.5}
          dash={isAiSuggestion ? [8, 4] : undefined}
          fill={isSelected ? `${color}22` : 'transparent'}
        />
        {/* Label tag */}
        <Rect x={x} y={y - 20} width={Math.min(w, 140)} height={18} fill={color} cornerRadius={3} />
        <Text
          x={x + 4} y={y - 17}
          text={`${lc?.name || '?'}${ann.confidence ? ` · ${Math.round(ann.confidence * 100)}%` : ''}`}
          fontSize={11} fill="#fff" fontStyle="500"
        />
        {/* Resize handles when selected */}
        {isSelected && [
          [x, y], [x + w / 2, y], [x + w, y],
          [x, y + h / 2], [x + w, y + h / 2],
          [x, y + h], [x + w / 2, y + h], [x + w, y + h],
        ].map(([hx, hy], i) => (
          <Circle
            key={i} x={hx} y={hy} radius={HANDLE_RADIUS}
            fill="#fff" stroke={color} strokeWidth={1.5}
            draggable
            onDragMove={(e) => {
              const normPt = toNorm(e.target.x(), e.target.y());
              // Update geometry based on which handle moved
              const newG = { ...g };
              if (i === 0) { newG.w += newG.x - normPt.x; newG.x = normPt.x; newG.h += newG.y - normPt.y; newG.y = normPt.y; }
              if (i === 1) { newG.h += newG.y - normPt.y; newG.y = normPt.y; }
              if (i === 2) { newG.w = normPt.x - newG.x; newG.h += newG.y - normPt.y; newG.y = normPt.y; }
              if (i === 3) { newG.w += newG.x - normPt.x; newG.x = normPt.x; }
              if (i === 4) { newG.w = normPt.x - newG.x; }
              if (i === 5) { newG.w += newG.x - normPt.x; newG.x = normPt.x; newG.h = normPt.y - newG.y; }
              if (i === 6) { newG.h = normPt.y - newG.y; }
              if (i === 7) { newG.w = normPt.x - newG.x; newG.h = normPt.y - newG.y; }
              onAnnotationUpdate(ann.id, { geometry: newG });
            }}
          />
        ))}
      </Group>
    );
  };

  const renderPolygon = (ann: Annotation) => {
    const g = ann.geometry as PolygonGeometry;
    const lc = labelById(ann.label_class_id);
    const color = lc?.color || '#EF9F27';
    const isSelected = ann.id === selectedAnnotationId;
    const isAiSuggestion = ann.status === 'ai_suggestion';
    const flatPts = g.points.flatMap(([px, py]) => [
      imgX + px * imageWidth * scale,
      imgY + py * imageHeight * scale,
    ]);

    return (
      <Group key={ann.id} onClick={() => { setSelectedAnnotation(ann.id); onAnnotationSelect(ann.id); }}>
        <Line
          points={flatPts} closed
          stroke={color} strokeWidth={isSelected ? 2.5 : 1.5}
          dash={isAiSuggestion ? [8, 4] : undefined}
          fill={isSelected ? `${color}22` : `${color}11`}
        />
        {isSelected && g.points.map(([px, py], i) => (
          <Circle
            key={i}
            x={imgX + px * imageWidth * scale}
            y={imgY + py * imageHeight * scale}
            radius={HANDLE_RADIUS}
            fill="#fff" stroke={color} strokeWidth={1.5}
            draggable
            onDragMove={(e) => {
              const normPt = toNorm(e.target.x(), e.target.y());
              const newPts = [...g.points];
              newPts[i] = [normPt.x, normPt.y];
              onAnnotationUpdate(ann.id, { geometry: { points: newPts } });
            }}
          />
        ))}
      </Group>
    );
  };

  // ── Draw preview ─────────────────────────────────────────────────────────────
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
          stroke="#fff" strokeWidth={1.5} dash={[6, 3]} fill="rgba(255,255,255,0.08)"
        />
      );
    }
    if (tool === 'polygon') {
      const flatPts = drawingPoints.flatMap((p) => [
        imgX + p.x * imageWidth * scale,
        imgY + p.y * imageHeight * scale,
      ]);
      return <Line points={flatPts} stroke="#fff" strokeWidth={1.5} dash={[6, 3]} />;
    }
    return null;
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0a1628' }}>
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
          {image && (
            <KonvaImage
              image={image}
              x={imgX} y={imgY}
              width={imageWidth * scale}
              height={imageHeight * scale}
            />
          )}
          {annotations.filter((a) => a.status !== 'ai_rejected').map((ann) => {
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
