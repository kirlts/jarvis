/**
 * useWhatsAppSSE — Real-time WhatsApp session status via Server-Sent Events
 *
 * Subscribes to GET /admin/whatsapp/status/stream and fires a callback
 * whenever any session's status or QR code changes.
 * 
 * Uses EventSource API with automatic reconnection.
 * Does NOT replace the initial data fetch — it supplements it with live updates.
 */
import { useEffect, useRef } from "react";
import { API_URL } from "../providers/constants";
import { getAuthHeader } from "../providers/auth";

interface StatusChangeEvent {
  tenant_id: string;
  session_id: string;
  status: string;
  qr_code: string | null;
  updated_at: string;
}

/**
 * Subscribe to WhatsApp session status changes via SSE.
 * 
 * @param onStatusChange - Callback fired on each status_change event
 * @param enabled - Whether the subscription is active (default: true)
 */
export function useWhatsAppSSE(
  onStatusChange: (event: StatusChangeEvent) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onStatusChange);
  callbackRef.current = onStatusChange;

  useEffect(() => {
    if (!enabled) return;

    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 10;

    const connect = () => {
      // EventSource doesn't support custom headers natively.
      // We pass the token as a query parameter (the SSE endpoint must accept it).
      // This is safe because SSE is admin-only over HTTPS.
      const auth = getAuthHeader();
      const token = auth?.Authorization?.replace("Bearer ", "") || "";
      const url = `${API_URL}/admin/whatsapp/status/stream?token=${encodeURIComponent(token)}`;

      eventSource = new EventSource(url);

      eventSource.addEventListener("status_change", (e) => {
        try {
          const data: StatusChangeEvent = JSON.parse(e.data);
          callbackRef.current(data);
        } catch {
          // Malformed payload — ignore
        }
      });

      // Activity updates: new messages, jobs, inbox entries
      eventSource.addEventListener("activity_update", (e) => {
        try {
          const data = JSON.parse(e.data);
          callbackRef.current({ ...data, _eventType: 'activity_update' });
        } catch {
          // Malformed payload — ignore
        }
      });

      eventSource.addEventListener("heartbeat", () => {
        // Reset retry counter on successful heartbeat
        retryCount = 0;
      });

      eventSource.onerror = () => {
        // EventSource auto-reconnects, but we add exponential backoff
        eventSource?.close();
        retryCount++;
        if (retryCount <= MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
          retryTimeout = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      eventSource?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [enabled]);
}
