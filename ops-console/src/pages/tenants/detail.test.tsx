/**
 * Timeline utilities and deduplication regression tests.
 *
 * These tests validate the pure business logic extracted to timeline-utils.ts,
 * NOT the full TenantDetailPage React component. This avoids the Vitest JSDOM
 * OOM crash caused by importing the 1550-line monolith with all its dependencies.
 *
 * Coverage:
 * - REG-004: formatJid + pushName labelling
 * - REG-005: copyToClipboard execCommand fallback
 * - REG-008: SSE auto-refresh (tested at hook level, not component level)
 * - REG-012: wapp-lifecycle message_received deduplication with sync_inbox
 * - Multimedia grouping (3 images → 1 activity with count 3)
 * - Caption lookahead across grouped items
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatJid,
  resolveBrowserUrl,
  formatBytes,
  timeAgo,
  copyToClipboard,
  buildTimelineEvents,
  groupTimelineEvents,
  extractSearchTerm,
} from "./timeline-utils";

describe("formatJid", () => {
  it("formats Chilean phone numbers correctly", () => {
    expect(formatJid("56994172921@s.whatsapp.net")).toBe("+56 9 9417 2921");
  });

  it("maps developer LID to real phone number", () => {
    expect(formatJid("163217431068839@lid")).toBe("+56 9 9417 2921");
  });

  it("returns 'Desconocido' for undefined", () => {
    expect(formatJid(undefined)).toBe("Desconocido");
  });

  it("formats generic numeric JIDs with + prefix", () => {
    expect(formatJid("1234567890@s.whatsapp.net")).toBe("+1234567890");
  });

  it("returns raw ID for non-numeric JIDs", () => {
    expect(formatJid("status@broadcast")).toBe("status");
  });
});

describe("resolveBrowserUrl", () => {
  it("rewrites storage hostname to provided hostname", () => {
    const result = resolveBrowserUrl("http://storage:9000/bucket/file.jpg", "admin.jarvis.local");
    expect(result).toBe("http://admin.jarvis.local:9000/bucket/file.jpg");
  });

  it("returns null for null/undefined input", () => {
    expect(resolveBrowserUrl(null)).toBeNull();
    expect(resolveBrowserUrl(undefined)).toBeNull();
  });

  it("returns original URL for non-internal hostnames", () => {
    const url = "https://cdn.example.com/file.jpg";
    expect(resolveBrowserUrl(url)).toBe(url);
  });
});

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });
});

describe("buildTimelineEvents — REG-012 deduplication", () => {
  it("filters out wapp-lifecycle message_received from jobs to prevent duplication with inbox", () => {
    const jobsData = [
      {
        id: "job-1",
        name: "wapp-lifecycle",
        created_on: "2026-05-29T07:59:36.562Z",
        data: { event: "message_received", type: "imageMessage", sender: "56994172921@s.whatsapp.net" },
      },
      {
        id: "job-2",
        name: "wapp-lifecycle",
        created_on: "2026-05-29T07:59:36.150Z",
        data: { event: "message_received", type: "albumMessage", sender: "56994172921@s.whatsapp.net" },
      },
      {
        id: "job-3",
        name: "wapp-lifecycle",
        created_on: "2026-05-29T07:59:35.000Z",
        data: { event: "connection_opened" },
      },
    ];

    const inboxData = [
      {
        id: "inbox-1",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:36.609Z",
      },
    ];

    const events = buildTimelineEvents(null, jobsData, inboxData);

    // Only connection_opened job should survive (message_received filtered)
    const jobEvents = events.filter((e) => e.type === "operación");
    expect(jobEvents).toHaveLength(1);
    expect(jobEvents[0].content).toBe("✅ Conexión establecida");

    // Inbox event should exist exactly once
    const inboxEvents = events.filter((e) => e.type === "whatsapp");
    expect(inboxEvents).toHaveLength(1);
  });

  it("single image produces exactly 1 event, not 2", () => {
    // Simulates the real-world scenario: 1 image = 1 wapp-lifecycle job + 1 sync_inbox record
    const jobsData = [
      {
        id: "job-1",
        name: "wapp-lifecycle",
        created_on: "2026-05-29T17:10:00.423Z",
        data: { event: "message_received", type: "imageMessage", sender: "56994172921@s.whatsapp.net" },
      },
    ];

    const inboxData = [
      {
        id: "inbox-1",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net", s3_url: "minio://bucket/img.jpg" },
        created_at: "2026-05-29T17:10:00.555Z",
      },
    ];

    const events = buildTimelineEvents(null, jobsData, inboxData);
    // Should produce exactly 1 event total (from inbox), not 2
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("whatsapp");
  });

  it("filters out sync-inbox-process jobs (redundant with inbox records)", () => {
    const jobsData = [
      {
        id: "job-sip-1",
        name: "sync-inbox-process",
        created_on: "2026-05-29T18:48:58.421Z",
        data: { inboxId: "inbox-1", payload: { type: "image", sender: "56994172921@s.whatsapp.net" }, tenantId: "t1" },
      },
      {
        id: "job-sip-2",
        name: "sync-inbox-process",
        created_on: "2026-05-29T18:48:58.292Z",
        data: { inboxId: "inbox-2", payload: { type: "image", sender: "56994172921@s.whatsapp.net" }, tenantId: "t1" },
      },
    ];

    const events = buildTimelineEvents(null, jobsData, null);
    const opEvents = events.filter((e) => e.type === "operación");
    expect(opEvents).toHaveLength(0);
  });

  it("2 images sent together produce exactly 1 grouped activity (full pipeline)", () => {
    // Real-world scenario: 2 images from WhatsApp create:
    // - 2x wapp-lifecycle message_received (filtered)
    // - 1x wapp-lifecycle albumMessage (filtered)
    // - 2x sync-inbox-process (filtered)
    // - 2x sync_inbox records (grouped into 1 whatsapp event)
    const jobsData = [
      { id: "j1", name: "wapp-lifecycle", created_on: "2026-05-29T18:48:58.360Z", data: { event: "message_received", type: "imageMessage", sender: "56994172921@s.whatsapp.net" } },
      { id: "j2", name: "sync-inbox-process", created_on: "2026-05-29T18:48:58.421Z", data: { inboxId: "i1", tenantId: "t1" } },
      { id: "j3", name: "wapp-lifecycle", created_on: "2026-05-29T18:48:58.180Z", data: { event: "message_received", type: "imageMessage", sender: "56994172921@s.whatsapp.net" } },
      { id: "j4", name: "sync-inbox-process", created_on: "2026-05-29T18:48:58.292Z", data: { inboxId: "i2", tenantId: "t1" } },
      { id: "j5", name: "wapp-lifecycle", created_on: "2026-05-29T18:48:58.036Z", data: { event: "message_received", type: "albumMessage", sender: "56994172921@s.whatsapp.net" } },
    ];

    const inboxData = [
      { id: "i1", payload: { type: "image", sender: "56994172921@s.whatsapp.net", message: "2 imágenes" }, created_at: "2026-05-29T18:48:58.500Z" },
      { id: "i2", payload: { type: "image", sender: "56994172921@s.whatsapp.net" }, created_at: "2026-05-29T18:48:58.400Z" },
    ];

    const events = buildTimelineEvents(null, jobsData, inboxData);
    const grouped = groupTimelineEvents(events);

    // All 5 jobs should be filtered → only 2 inbox events remain → grouped into 1
    expect(grouped).toHaveLength(1);
    expect(grouped[0].content).toContain("2 Imágenes");
    expect(grouped[0].content).toContain("+ Texto de");
    expect(grouped[0].additionalItems).toHaveLength(1);
  });
});

describe("groupTimelineEvents — multimedia grouping", () => {
  it("groups 3 images from the same sender within 5s into 1 activity", () => {
    const events = buildTimelineEvents(null, null, [
      {
        id: "inbox-1",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:36.609Z",
      },
      {
        id: "inbox-2",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:36.478Z",
      },
      {
        id: "inbox-3",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:36.428Z",
      },
    ]);

    const grouped = groupTimelineEvents(events);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].content).toContain("3 Imágenes");
    expect(grouped[0].additionalItems).toHaveLength(2);
  });

  it("does NOT group images from different senders", () => {
    const events = buildTimelineEvents(null, null, [
      {
        id: "inbox-1",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:36.609Z",
      },
      {
        id: "inbox-2",
        payload: { type: "image", sender: "56912345678@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:36.478Z",
      },
    ]);

    const grouped = groupTimelineEvents(events);
    expect(grouped).toHaveLength(2);
  });

  it("does NOT group images separated by more than 5 seconds", () => {
    const events = buildTimelineEvents(null, null, [
      {
        id: "inbox-1",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:40.000Z",
      },
      {
        id: "inbox-2",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:34.000Z", // 6s diff
      },
    ]);

    const grouped = groupTimelineEvents(events);
    expect(grouped).toHaveLength(2);
  });

  it("propagates caption from a sub-item to the group header", () => {
    const events = buildTimelineEvents(null, null, [
      {
        id: "inbox-1",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net" },
        created_at: "2026-05-29T07:59:36.609Z",
      },
      {
        id: "inbox-2",
        payload: { type: "image", sender: "56994172921@s.whatsapp.net", message: "Hola mundo" },
        created_at: "2026-05-29T07:59:36.478Z",
      },
    ]);

    const grouped = groupTimelineEvents(events);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].content).toContain("+ Texto de");
    // Caption should have been propagated to the group header item
    expect(grouped[0].item.payload.message).toBe("Hola mundo");
  });

  it("groups outgoing wapp-send-process jobs to the same recipient within 5s", () => {
    const jobsData = [
      { id: "j1", name: "wapp-send-process", created_on: "2026-05-29T18:54:35.626Z", data: { to: "56994172921@s.whatsapp.net", text: "Respuesta 1" } },
      { id: "j2", name: "wapp-send-process", created_on: "2026-05-29T18:54:33.656Z", data: { to: "56994172921@s.whatsapp.net", text: "Respuesta 2" } },
    ];

    const events = buildTimelineEvents(null, jobsData, null);
    const grouped = groupTimelineEvents(events);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].content).toContain("2 Mensajes enviados");
    expect(grouped[0].content).toContain("+56 9 9417 2921");
    expect(grouped[0].additionalItems).toHaveLength(1);
  });

  it("does NOT group outgoing messages to different recipients", () => {
    const jobsData = [
      { id: "j1", name: "wapp-send-process", created_on: "2026-05-29T18:54:35.626Z", data: { to: "56994172921@s.whatsapp.net", text: "Msg A" } },
      { id: "j2", name: "wapp-send-process", created_on: "2026-05-29T18:54:33.656Z", data: { to: "56912345678@s.whatsapp.net", text: "Msg B" } },
    ];

    const events = buildTimelineEvents(null, jobsData, null);
    const grouped = groupTimelineEvents(events);

    expect(grouped).toHaveLength(2);
  });
});

describe("extractSearchTerm", () => {
  it("extracts filename from s3_url", () => {
    const evt = {
      type: "whatsapp",
      id: "1",
      date: "2026-01-01",
      content: "",
      item: { payload: { s3_url: "minio://bucket/path/to/img-abc123.jpg" } },
    };
    expect(extractSearchTerm(evt)).toBe("img-abc123.jpg");
  });

  it("returns null when no s3_url", () => {
    const evt = {
      type: "whatsapp",
      id: "1",
      date: "2026-01-01",
      content: "",
      item: { payload: { type: "text" } },
    };
    expect(extractSearchTerm(evt)).toBeNull();
  });
});

describe("copyToClipboard — REG-005 fallback", () => {
  it("falls back to document.execCommand when navigator.clipboard is unavailable", async () => {
    const originalClipboard = navigator.clipboard;
    // @ts-ignore — remove clipboard to simulate insecure context
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });

    document.execCommand = vi.fn().mockReturnValue(true);
    const spy = vi.spyOn(document, "execCommand");

    await copyToClipboard("test text");

    expect(spy).toHaveBeenCalledWith("copy");

    // Restore
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true });
    }
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });
});
