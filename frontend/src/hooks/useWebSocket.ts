import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store';
import type { WSEvent } from '../types';

// Same-origin by default (nginx proxies /ws to the backend) — falls back to
// localhost:8000 only for `vite dev` outside Docker. Never hardcode a host in prod;
// that only works on the machine running the dev server.
const WS_BASE =
  import.meta.env.VITE_WS_URL ||
  (import.meta.env.DEV
    ? 'ws://localhost:8000'
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`);

export function useProjectWebSocket(
  projectId: number | null,
  onEvent: (event: WSEvent) => void
) {
  const token = useAuthStore((s) => s.token);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!projectId || !token) return;
    const ws = new WebSocket(`${WS_BASE}/ws/${projectId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Backend requires the JWT as the first message, not in the URL —
      // query strings get logged by proxies/CDNs.
      ws.send(JSON.stringify({ token }));
    };

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
