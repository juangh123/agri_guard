import { useEffect, useRef } from 'react';

// WebSocket realtime is opt-in so deployments without a working Channels/Redis
// endpoint do not emit avoidable browser connection warnings.
const WS_BASE_URL = (import.meta.env.VITE_WS_BASE_URL || '').trim();

/**
 * useAlertsSocket — connects to the backend AlertConsumer at ws(s)://<host>/ws/alerts/
 * when VITE_WS_BASE_URL is explicitly configured.
 *
 * Backend wire format (core/consumers.py):
 *   - on connect:      { "message": "Connected to Alert WebSocket" }
 *   - pushed messages: { "message": { "type": "NEW_ALERT", "data": {...} } }
 */
export default function useAlertsSocket({ onMessage, onNewAlert } = {}) {
  const handlersRef = useRef({ onMessage, onNewAlert });
  handlersRef.current = { onMessage, onNewAlert };

  useEffect(() => {
    if (!WS_BASE_URL) return undefined;

    let socket = null;
    let reconnectTimer = null;
    let attempts = 0;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;

      socket = new WebSocket(WS_BASE_URL);

      socket.onopen = () => {
        attempts = 0;
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const payload = parsed?.message;
          if (payload && typeof payload === 'object' && payload.type) {
            handlersRef.current.onMessage?.(payload);
            if (payload.type === 'NEW_ALERT') {
              handlersRef.current.onNewAlert?.(payload.data);
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket alert message:', err);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (unmounted) return;
        const delay = Math.min(1000 * 2 ** attempts, 30000);
        attempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);
}
