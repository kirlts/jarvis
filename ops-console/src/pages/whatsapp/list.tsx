/**
 * WhatsApp Status & Session Management Page — C.1 through C.6 & C.8
 *
 * Implements:
 * - Session list with status badges and live dot indicators (C.1)
 * - Dynamic QR Code rendering from wapp_sessions.qr_code (C.8)
 * - Auto-refresh (fast 3s refresh when QR is pending, otherwise 10s) (C.3)
 * - Actions: Reconnect/Regenerate QR (POST /reconnect), Disconnect (DELETE), and Audit Logs (GET /audit)
 * - Monospace audit logging viewer modal.
 */
import { useList, useDelete, useCustom } from "@refinedev/core";
import { useEffect, useState, useCallback } from "react";
import { API_URL } from "../../providers/constants";
import { getAuthHeader } from "../../providers/auth";
import { useWhatsAppSSE } from "../../hooks/useWhatsAppSSE";

interface WhatsAppConnection {
  id: string;
  tenant_id: string;
  status: string;
  qr_code?: string;
  qr_generated_at?: string;
  qr_scanned_at?: string;
  qr_scanned_by?: string;
  updated_at: string;
}

interface AuditLog {
  id: string;
  actor: string;
  action: string;
  details: { message?: string } | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  connected: "badge-success",
  disconnected: "badge-danger",
  connecting: "badge-warning",
  qr_pending: "badge-info",
  qr_expired: "badge-warning",
  waiting_qr: "badge-info",
};

const STATUS_DOT: Record<string, string> = {
  connected: "dashboard-dot-success",
  disconnected: "dashboard-dot-danger",
  connecting: "dashboard-dot-warning",
  qr_pending: "dashboard-dot-info",
  qr_expired: "dashboard-dot-warning",
  waiting_qr: "dashboard-dot-info",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function WhatsAppStatusPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [auditTenantId, setAuditTenantId] = useState<string | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);

  const { query, result } = useList<WhatsAppConnection>({
    resource: "whatsapp",
    queryOptions: {
      queryKey: ['whatsapp-status', refreshKey],
    },
  });

  const { mutate: deleteSession } = useDelete();

  // Custom reconnect hook
  const handleReconnect = async (tenantId: string) => {
    try {
      const response = await fetch(`${API_URL}/admin/whatsapp/status/${tenantId}/reconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Failed to trigger reconnect");
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error reconnecting");
    }
  };

  // Fetch audits manually
  const openAudits = async (tenantId: string) => {
    setAuditTenantId(tenantId);
    setIsAuditLoading(true);
    try {
      const response = await fetch(`${API_URL}/admin/whatsapp/status/${tenantId}/audit`, {
        headers: {
          ...getAuthHeader(),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch audits");
      const data = await response.json();
      setAudits(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAuditLoading(false);
    }
  };

  const connections = result.data ?? [];

  // SSE-driven real-time updates: refetch when any session's status changes in the DB
  useWhatsAppSSE(
    useCallback(() => setRefreshKey(k => k + 1), [])
  );

  // Count by status
  const statusCounts: Record<string, number> = {};
  for (const conn of connections) {
    statusCounts[conn.status] = (statusCounts[conn.status] || 0) + 1;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">WhatsApp Channels</h1>
          <p className="page-subtitle">
            Baileys session monitoring & real-time QR scanner (Phase 1 Sandbox)
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setRefreshKey(k => k + 1)}
          id="whatsapp-refresh"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Status summary cards */}
      {connections.length > 0 && (
        <div className="dashboard-grid" style={{ marginBottom: 'var(--sp-6)' }}>
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="dashboard-card" style={{ cursor: 'default' }}>
              <div className="dashboard-card-row">
                <span className={`dashboard-dot ${STATUS_DOT[status] || 'dashboard-dot-neutral'}`} />
                <span className="dashboard-card-label" style={{ marginBottom: 0 }}>
                  {status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="dashboard-card-value" style={{ marginTop: 'var(--sp-2)' }}>
                {count}
              </div>
            </div>
          ))}
        </div>
      )}

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Failed to load WhatsApp status"}
        </div>
      )}

      {query.isLoading ? (
        <div className="data-table-wrapper" aria-label="Loading connections…">
          <div style={{ display: 'none' }}>Loading connections…</div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <p className="empty-state-text">
            No WhatsApp sessions registered.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          {connections.map((conn: WhatsAppConnection) => (
            <div key={conn.tenant_id} className="dashboard-card" style={{ cursor: 'default', padding: 'var(--sp-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' }}>
                    <span className={`dashboard-dot ${STATUS_DOT[conn.status] || 'dashboard-dot-neutral'}`} />
                    <span className="cell-mono" style={{ fontSize: '1.1rem', fontWeight: 6 }}>
                      Tenant: {conn.tenant_id}
                    </span>
                    <span className={`badge ${STATUS_BADGE[conn.status] || "badge-neutral"}`}>
                      {conn.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'color-mix(in oklch, var(--text) 70%, transparent)' }}>
                    Last Heartbeat: {conn.updated_at ? timeAgo(conn.updated_at) : '—'}
                  </p>
                  
                  {/* QR Audit Metadata */}
                  {(conn.qr_scanned_at || conn.qr_generated_at) && (
                    <div style={{ marginTop: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', fontSize: '0.85rem' }}>
                      {conn.qr_generated_at && (
                        <span>✨ QR Generated: <strong className="cell-mono">{new Date(conn.qr_generated_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong></span>
                      )}
                      {conn.qr_scanned_at && (
                        <span>✅ QR Scanned: <strong className="cell-mono">{new Date(conn.qr_scanned_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong> by <span className="badge badge-neutral">{conn.qr_scanned_by}</span></span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openAudits(conn.tenant_id)}
                  >
                    📜 View QR Audits
                  </button>
                  {/* Regenerate QR: shows when QR is expired, pending, waiting, or disconnected without prior connection */}
                  {(conn.status === 'qr_expired' || conn.status === 'qr_pending' || conn.status === 'waiting_qr' || conn.status === 'disconnected') && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleReconnect(conn.tenant_id)}
                    >
                      📱 Regenerate QR
                    </button>
                  )}
                  {/* Reconnect: only shows when session was previously connected (has credentials) */}
                  {conn.status === 'connected' && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleReconnect(conn.tenant_id)}
                    >
                      🔄 Reconnect
                    </button>
                  )}
                  {conn.status === 'qr_pending' || conn.status === 'waiting_qr' ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'oklch(0.65 0.15 80)', borderColor: 'oklch(0.65 0.15 80 / 0.3)' }}
                      onClick={() => {
                        if (confirm("Are you sure you want to cancel this pending connection request?")) {
                          deleteSession({
                            resource: "whatsapp",
                            id: conn.tenant_id,
                          }, {
                            onSuccess: () => {
                              setRefreshKey(k => k + 1);
                            }
                          });
                        }
                      }}
                    >
                      🚫 Cancel Request
                    </button>
                  ) : conn.status !== 'qr_expired' ? (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to disconnect this WhatsApp channel? This will clear session credentials in the DB.")) {
                          deleteSession({
                            resource: "whatsapp",
                            id: conn.tenant_id,
                          }, {
                            onSuccess: () => {
                              setRefreshKey(k => k + 1);
                            }
                          });
                        }
                      }}
                    >
                      ❌ Disconnect
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Real-time QR Code Visualizer Block (Feature C.8) */}
              {conn.status === 'qr_pending' && conn.qr_code && (
                <div style={{ 
                  marginTop: 'var(--sp-5)', 
                  padding: 'var(--sp-5)', 
                  borderRadius: 'var(--radius)', 
                  background: 'color-mix(in oklch, var(--surface-bg) 60%, transparent)', 
                  border: '1px dashed color-mix(in oklch, var(--text) 20%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-6)',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ 
                    padding: 'var(--sp-3)', 
                    background: '#fff', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center'
                  }}>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(conn.qr_code)}`}
                      alt="WhatsApp QR Code"
                      style={{ width: '200px', height: '200px' }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <h3 style={{ margin: '0 0 var(--sp-2) 0', color: 'oklch(var(--text))' }}>Scan QR Code with WhatsApp</h3>
                    <p style={{ margin: '0 0 var(--sp-4) 0', fontSize: '0.9rem', color: 'color-mix(in oklch, var(--text) 70%, transparent)' }}>
                      Open WhatsApp on your phone, go to Linked Devices, and scan this code to connect the channel. 
                      The panel will automatically refresh and connect within 3 seconds of scanning.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Raw QR Code String:</span>
                      <pre className="monospace-block" style={{ margin: 0, fontSize: '0.8rem', overflowX: 'auto', whiteSpace: 'pre' }}>
                        {conn.qr_code}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* QR Expired State */}
              {conn.status === 'qr_expired' && (
                <div style={{ 
                  marginTop: 'var(--sp-5)', 
                  padding: 'var(--sp-5)', 
                  borderRadius: 'var(--radius)', 
                  background: 'color-mix(in oklch, oklch(0.65 0.15 80) 10%, transparent)', 
                  border: '1px dashed oklch(0.65 0.15 80 / 0.4)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 'var(--sp-3)' }}>⏰</div>
                  <h3 style={{ margin: '0 0 var(--sp-2) 0' }}>QR Code Expired</h3>
                  <p style={{ margin: '0 0 var(--sp-4) 0', fontSize: '0.9rem', color: 'color-mix(in oklch, var(--text) 70%, transparent)' }}>
                    The QR code was not scanned in time. Click "Regenerate QR" above to generate a new one.
                  </p>
                </div>
              )}

              {/* Initializing / waiting_qr State */}
              {conn.status === 'waiting_qr' && (
                <div style={{ 
                  marginTop: 'var(--sp-5)', 
                  padding: 'var(--sp-5)', 
                  borderRadius: 'var(--radius)', 
                  background: 'color-mix(in oklch, var(--surface-bg) 60%, transparent)', 
                  border: '1px dashed color-mix(in oklch, var(--text) 20%, transparent)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--sp-3)'
                }}>
                  <div className="loading-spinner" style={{ width: '24px', height: '24px', borderWidth: '3px' }} />
                  <h3 style={{ margin: '0 0 var(--sp-1) 0', color: 'oklch(var(--text))' }}>Initializing WhatsApp Channel</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'color-mix(in oklch, var(--text) 70%, transparent)' }}>
                    Triggering Baileys background worker, generating secure authentication session and preparing QR code.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'color-mix(in oklch, var(--text) 50%, transparent)', fontStyle: 'italic' }}>
                    This typically takes 5-10 seconds. The page will automatically refresh with the QR code.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* QR Audits Modal */}
      {auditTenantId && (
        <div className="modal-overlay" onClick={() => setAuditTenantId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>QR Scan & Session Audits</h2>
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={() => setAuditTenantId(null)}
                style={{ fontSize: '1.2rem', padding: '0 var(--sp-2)', lineHeight: 1 }}
                title="Close"
              >
                ×
              </button>
            </div>
            
            <div className="modal-body" style={{ margin: 0 }}>
              {isAuditLoading ? (
                <div style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
                  <span className="skeleton skeleton-line" style={{ width: '80%', margin: '0 auto var(--sp-2) auto' }} />
                  <span className="skeleton skeleton-line" style={{ width: '60%', margin: '0 auto' }} />
                </div>
              ) : audits.length === 0 ? (
                <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'color-mix(in oklch, var(--text) 50%, transparent)' }}>
                  No audit entries recorded for this channel.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxHeight: '400px', overflowY: 'auto', paddingRight: 'var(--sp-2)' }}>
                  {audits.map((audit) => (
                    <div key={audit.id} style={{ 
                      padding: 'var(--sp-3)', 
                      borderRadius: 'var(--radius-md)', 
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border-subtle)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-2)', fontSize: '0.85rem' }}>
                        <span className="cell-mono" style={{ fontWeight: 6 }}>{audit.action.toUpperCase()}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {new Date(audit.created_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', fontSize: '0.85rem', marginBottom: 'var(--sp-2)' }}>
                        <span>Actor:</span>
                        <span className="badge badge-neutral">{audit.actor}</span>
                      </div>
                      {audit.details && (
                        <pre className="monospace-block" style={{ fontSize: '0.8rem', padding: 'var(--sp-2)', margin: 0 }}>
                          {typeof audit.details === 'string' ? audit.details : JSON.stringify(audit.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="modal-actions" style={{ marginTop: 'var(--sp-6)' }}>
              <button className="btn btn-ghost" onClick={() => setAuditTenantId(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
