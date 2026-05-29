/**
 * Timeline utilities for TenantDetailPage.
 *
 * Extracted to enable isolated unit testing without mounting the full
 * 1550-line TenantDetailPage component (which OOMs Vitest/JSDOM).
 */

// ── JID Formatting ──────────────────────────────────────────────────
export function formatJid(jid?: string): string {
  if (!jid) return 'Desconocido';
  const rawId = jid.split('@')[0];
  const id = rawId.replace(/^\+/, '');
  if (id === '163217431068839') {
    return '+56 9 9417 2921'; // Real phone number mapping for developer/admin LID
  }
  if (id.startsWith('569') && id.length === 11) {
    return `+56 9 ${id.slice(3, 7)} ${id.slice(7)}`;
  }
  if (/^\d+$/.test(id)) return `+${id}`;
  return rawId;
}

// ── Browser URL resolution ──────────────────────────────────────────
export function resolveBrowserUrl(url?: string | null, hostname?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (['storage', 'localhost', '127.0.0.1'].includes(parsed.hostname)) {
      parsed.hostname = hostname || 'localhost';
    }
    return parsed.toString();
  } catch (_) {
    return url;
  }
}

// ── Byte formatting ─────────────────────────────────────────────────
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// ── Relative time ───────────────────────────────────────────────────
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `hace ${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}

// ── Clipboard with fallback ─────────────────────────────────────────
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

// ── Types ───────────────────────────────────────────────────────────
export interface TimelineEvent {
  type: string;
  id: string;
  date: string;
  content: string;
  item: any;
  additionalItems?: any[];
}

// ── Event building from raw data sources ────────────────────────────
export function buildTimelineEvents(
  auditData: any[] | null | undefined,
  jobsData: any[] | null | undefined,
  inboxData: any[] | null | undefined
): TimelineEvent[] {
  const evts: TimelineEvent[] = [];

  if (auditData) {
    evts.push(...auditData
      .filter((i: any) => !['reconnect_whatsapp', 'disconnect_whatsapp'].includes(i.action))
      .map((i: any) => ({ type: 'auditoría', id: i.id, date: i.created_at, content: i.details?.message || i.action, item: i }))
    );
  }

  if (jobsData) {
    evts.push(...jobsData
      .filter((i: any) => i.name !== 'wapp-session-control')
      .filter((i: any) => !(i.name === 'wapp-lifecycle' && i.data?.event === 'connection_closed'))
      // Incoming messages are already represented by sync_inbox (richer data: s3_url, payload).
      // Keeping wapp-lifecycle message_received would duplicate every incoming message in the timeline.
      .filter((i: any) => !(i.name === 'wapp-lifecycle' && i.data?.event === 'message_received'))
      // sync-inbox-process is the worker job that processes inbox items — redundant with the inbox record itself.
      .filter((i: any) => i.name !== 'sync-inbox-process')
      .map((i: any) => {
        let content = i.description || i.name;
        if (i.name === 'wapp-send-process' && i.data?.text) {
          content = `📤 Enviado: ${i.data.text}`;
        } else if (i.name === 'core-process-message') {
          content = `⚙️ Procesando mensaje de ${formatJid(i.data?.sender)}`;
        } else if (i.name === 'wapp-lifecycle' && i.data?.event === 'connection_opened') {
          content = `✅ Conexión establecida`;
        }
        return { type: 'operación', id: i.id, date: i.created_on, content, item: i };
      }));
  }

  if (inboxData) {
    evts.push(...inboxData.map((i: any) => {
      const mediaLabel: Record<string, string> = {
        audio: '🎵 Audio', image: '🖼️ Imagen', video: '🎬 Video', document: '📄 Documento',
      };
      const typeLabel = mediaLabel[i.payload?.type];
      let displayName = formatJid(i.payload?.sender || i.sender);
      if (i.message?.pushName) {
        displayName = i.message.pushName.length > 20 ? i.message.pushName.substring(0, 20) + '...' : i.message.pushName;
      }

      let content = '';
      if (typeLabel) {
        content = i.payload?.message
          ? `📥 ${typeLabel} + Texto de ${displayName}`
          : `📥 ${typeLabel} recibido de ${displayName}`;
      } else {
        content = `📥 Mensaje recibido de ${displayName}`;
      }
      return { type: 'whatsapp', id: i.id, date: i.created_at, content, item: i };
    }));
  }

  return evts;
}

// ── Generalized event grouping algorithm ────────────────────────────
// Groups contiguous events that share the same "grouping key" within a 5-second window.
// Works for incoming multimedia (whatsapp), outgoing messages (operación/wapp-send-process),
// and any future repeated operation from the same actor.

/** Compute a grouping key that identifies "same logical action" */
function getGroupKey(evt: TimelineEvent): string | null {
  if (evt.type === 'whatsapp') {
    const sender = evt.item.payload?.sender || evt.item.sender;
    const msgType = evt.item.payload?.type;
    const isMultimedia = ['image', 'audio', 'video', 'document', 'sticker'].includes(msgType || '');
    if (sender && isMultimedia) return `whatsapp:${sender}:${msgType}`;
    return null; // text-only whatsapp messages don't group
  }
  if (evt.type === 'operación') {
    const name = evt.item.name;
    if (name === 'wapp-send-process') {
      const to = evt.item.data?.to;
      return to ? `op:send:${to}` : null;
    }
    // Future: add more job types here if they should group
    return null;
  }
  return null;
}

function getCaption(evt: TimelineEvent): string | null {
  if (evt.type === 'whatsapp') return evt.item.payload?.message || evt.item.payload?.caption || evt.item.payload?.textContent;
  return null;
}

function getGroupLabel(evt: TimelineEvent, count: number): string {
  if (evt.type === 'whatsapp') {
    const sender = evt.item.payload?.sender || evt.item.sender;
    const msgType = evt.item.payload?.type;
    const mediaMap: Record<string, string> = {
      image: 'Imágenes', audio: 'Notas de voz', video: 'Videos',
      document: 'Documentos', sticker: 'Stickers',
    };
    const mediaName = mediaMap[msgType || ''] || 'Archivos';
    const displayName = formatJid(sender);
    const hasText = getCaption(evt);
    return hasText
      ? `📥 ${count} ${mediaName} + Texto de ${displayName}`
      : `📥 ${count} ${mediaName} recibidas de ${displayName}`;
  }
  if (evt.type === 'operación' && evt.item.name === 'wapp-send-process') {
    const to = evt.item.data?.to;
    return `📤 ${count} Mensajes enviados a ${formatJid(to)}`;
  }
  return `${count}x ${evt.content}`;
}

export function groupTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  const sorted = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const grouped: TimelineEvent[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentKey = getGroupKey(current);

    if (currentKey) {
      const lastGroup = grouped[grouped.length - 1];
      const lastKey = lastGroup ? getGroupKey(lastGroup) : null;
      const timeDiff = lastGroup ? Math.abs(new Date(lastGroup.date).getTime() - new Date(current.date).getTime()) : Infinity;

      if (lastGroup && lastKey === currentKey && timeDiff <= 5000) {
        if (!lastGroup.additionalItems) {
          lastGroup.additionalItems = [];
        }
        lastGroup.additionalItems.push(current);

        // Propagate caption from sub-items to group header
        const currentCaption = getCaption(current);
        const lastCaption = getCaption(lastGroup);
        if (currentCaption && !lastCaption) {
          if (!lastGroup.item.payload) lastGroup.item.payload = {};
          lastGroup.item.payload.message = currentCaption;
        }

        const count = 1 + lastGroup.additionalItems.length;
        lastGroup.content = getGroupLabel(lastGroup, count);
        continue;
      }
    }

    grouped.push(current);
  }
  return grouped;
}

// ── Media search term extraction ────────────────────────────────────
export function extractSearchTerm(evt: TimelineEvent): string | null {
  const s3Url = evt.item?.payload?.s3_url;
  if (s3Url) {
    return s3Url.split('/').pop() || null;
  }
  return null;
}
