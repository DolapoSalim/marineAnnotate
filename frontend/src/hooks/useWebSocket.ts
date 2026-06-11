import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store';
import type { WSEvent } from '../types';

const WS_BASE = (import.meta.env.VITE_WS_URL || 'ws://localhost:8000');

export function useProjectWebSocket(
  projectId: number | null,
  onEvent: (event: WSEvent) => void
) {
  const token = useAuthStore((s) => s.token);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!projectId || !token) return;
    const ws = new WebSocket(`${WS_BASE}/ws/${projectId}?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data);
        onEvent(event);
      } catch {}
    };

    ws.onclose = () => {
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [projectId, token, onEvent]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
