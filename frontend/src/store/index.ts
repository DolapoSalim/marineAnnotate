import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CanvasState, DrawingTool, LabelClass, User } from '../types';

// ── Auth Store ────────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('access_token', token);
        set({ user, token });
      },
      clearAuth: () => {
        localStorage.removeItem('access_token');
        set({ user: null, token: null });
      },
    }),
    { name: 'marine-auth' }
  )
);

// ── Canvas Store ──────────────────────────────────────────────────────────────
interface CanvasStore extends CanvasState {
  setTool: (tool: DrawingTool) => void;
  setSelectedAnnotation: (id: number | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setDrawing: (drawing: boolean) => void;
  addDrawingPoint: (pt: { x: number; y: number }) => void;
  clearDrawingPoints: () => void;
  resetCanvas: () => void;
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  tool: 'select',
  selectedAnnotationId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  isDrawing: false,
  drawingPoints: [],

  setTool: (tool) => set({ tool, selectedAnnotationId: null, isDrawing: false, drawingPoints: [] }),
  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  setDrawing: (isDrawing) => set({ isDrawing }),
  addDrawingPoint: (pt) => set((s) => ({ drawingPoints: [...s.drawingPoints, pt] })),
  clearDrawingPoints: () => set({ isDrawing: false, drawingPoints: [] }),
  resetCanvas: () => set({ zoom: 1, panX: 0, panY: 0, selectedAnnotationId: null }),
}));

// ── Active Project / Label Store ──────────────────────────────────────────────
interface ProjectStore {
  projectId: number | null;
  labels: LabelClass[];
  activeLabelId: number | null;
  setProject: (id: number) => void;
  setLabels: (labels: LabelClass[]) => void;
  setActiveLabel: (id: number | null) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projectId: null,
  labels: [],
  activeLabelId: null,
  setProject: (id) => set({ projectId: id }),
  setLabels: (labels) => set({ labels, activeLabelId: labels[0]?.id ?? null }),
  setActiveLabel: (id) => set({ activeLabelId: id }),
}));
