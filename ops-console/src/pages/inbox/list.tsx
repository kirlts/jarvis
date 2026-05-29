/**
 * Sync Inbox Monitor Page — E.1 through E.5
 *
 * Features:
 * - Paginated list of inbox items with filters (status, tenant_id) (E.1, E.3)
 * - Status badges with semantic colors (pending, processing, done, failed)
 * - Inbox item detail modal with raw JSONB viewer (E.2)
 * - Reprocess failed inbox item trigger (E.4)
 * - Backlog count and failed count dashboard-style metrics in header (E.5)
 * - Skeleton loading states
 */
import { useList, useUpdate } from "@refinedev/core";
import { useState, useCallback } from "react";
import { useToast } from "../../components/toast";
import { API_URL } from "../../providers/constants";
import { getAuthHeader } from "../../providers/auth";

interface InboxItem {
  id: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  processed_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "badge-warning",
  processing: "badge-info",
  done: "badge-success",
  failed: "badge-danger",
};

export function SyncInboxPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const pageSize = 20;
  const { addToast } = useToast();

  const filters = [];
  if (statusFilter) filters.push({ field: "status", operator: "eq" as const, value: statusFilter });
  if (tenantFilter) filters.push({ field: "tenant_id", operator: "eq" as const, value: tenantFilter });

  const { query, result } = useList<InboxItem>({
    resource: "inbox",
    pagination: { currentPage: page, pageSize },
    filters,
  });

  // Query counts for E.5 backlog metrics (pending items + failed items)
  const { result: backlogResult } = useList<InboxItem>({
    resource: "inbox",
    pagination: { pageSize: 1 },
    filters: [{ field: "status", operator: "eq" as const, value: "pending" }],
  });

  const { result: failedResult } = useList<InboxItem>({
    resource: "inbox",
    pagination: { pageSize: 1 },
    filters: [{ field: "status", operator: "eq" as const, value: "failed" }],
  });

  const items = result.data ?? [];
  const total = result.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const backlogCount = backlogResult?.total ?? 0;
  const failedCount = failedResult?.total ?? 0;

  const handleReprocess = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReprocessingId(id);
    const item = items.find(i => i.id === id);
    const isRollback = item?.status === 'done';
    try {
      const resp = await fetch(
        `${API_URL}/admin/inbox/${id}/reprocess`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      addToast(
        isRollback 
          ? "Inbox item queued for rollback & replay" 
          : "Inbox item queued for reprocessing", 
        "success"
      );
      query.refetch();
    } catch (err) {
      addToast(`Action failed: ${(err as Error).message}`, "error");
    } finally {
      setReprocessingId(null);
    }
  }, [addToast, query, items]);

  // Fetch full item detail JSON payload (E.2)
  const handleViewDetail = useCallback(async (item: InboxItem) => {
    try {
      const resp = await fetch(
        `${API_URL}/admin/inbox/${item.id}`,
        {
          headers: getAuthHeader(),
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      const detailedItem = await resp.json();
      setSelectedItem(detailedItem);
    } catch (err) {
      addToast(`Failed to load details: ${(err as Error).message}`, "error");
    }
  }, [addToast]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sync Inbox</h1>
          <p className="page-subtitle">Webhook ingestion pipeline observability</p>
        </div>
      </div>

      {/* Backlog Metrics (E.5) */}
      <div className="dashboard-grid" style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="dashboard-card" style={{ cursor: 'default' }}>
          <div className="dashboard-card-label">Pending Backlog</div>
          <div className="dashboard-card-value">{backlogCount}</div>
          <div className="dashboard-card-sub">Items currently waiting to process</div>
        </div>
        <div className="dashboard-card" style={{ cursor: 'default', borderLeft: failedCount > 0 ? '4px solid var(--danger)' : undefined }}>
          <div className="dashboard-card-label">Failed webhook tasks</div>
          <div className="dashboard-card-value" style={{ color: failedCount > 0 ? 'var(--danger)' : undefined }}>
            {failedCount}
          </div>
          <div className="dashboard-card-sub">Items requiring manual triage</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <select
          className="form-input"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          id="inbox-status-filter"
          style={{ maxWidth: '200px' }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="done">Done</option>
          <option value="failed">Failed</option>
        </select>
        <input
          className="form-input"
          type="text"
          placeholder="Filter by tenant ID…"
          value={tenantFilter}
          onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
          style={{ maxWidth: '280px' }}
          id="inbox-tenant-filter"
        />
      </div>

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Failed to load sync inbox"}
        </div>
      )}

      {query.isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📥</div>
          <p className="empty-state-text">No sync inbox items found</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item ID</th>
                <th>Status</th>
                <th>Tenant ID</th>
                <th>Created</th>
                <th>Processed</th>
                <th className="cell-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => handleViewDetail(item)}
                >
                  <td className="cell-mono">{item.id.substring(0, 8)}…</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[item.status] || "badge-neutral"}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="cell-mono" style={{ fontSize: 'var(--text-xs)' }}>
                    {item.tenant_id.substring(0, 8)}…
                  </td>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(item.created_at).toLocaleString("es-CL", { hour12: false,
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
                    })}
                  </td>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>
                    {item.processed_at ? new Date(item.processed_at).toLocaleString("es-CL", { hour12: false,
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
                    }) : '—'}
                  </td>
                  <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    {item.status === 'failed' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={reprocessingId === item.id}
                        onClick={(e) => handleReprocess(item.id, e)}
                        style={{ color: 'var(--info)' }}
                      >
                        {reprocessingId === item.id ? "Queuing…" : "🔄 Reprocess"}
                      </button>
                    )}
                    {item.status === 'done' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={reprocessingId === item.id}
                        onClick={(e) => handleReprocess(item.id, e)}
                        style={{ color: 'var(--warning-subtle)' }}
                      >
                        {reprocessingId === item.id ? "Rolling back…" : "⏪ Rollback & Replay"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="pagination-buttons">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync Inbox Detail Modal (E.2) */}
      {selectedItem && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedItem(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="inbox-detail-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h2 className="modal-title" id="inbox-detail-title">
              Inbox Event Item
            </h2>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
              <span className={`badge ${STATUS_BADGE[selectedItem.status] || 'badge-neutral'}`}>
                {selectedItem.status}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {selectedItem.id}
              </span>
            </div>

            <div className="data-table-wrapper" style={{ marginBottom: 'var(--sp-4)' }}>
              <table className="data-table">
                <tbody>
                  <tr><td style={{ fontWeight: 500, width: '120px' }}>Tenant ID</td><td className="cell-mono">{selectedItem.tenant_id}</td></tr>
                  <tr><td style={{ fontWeight: 500 }}>Created</td><td className="cell-mono">{new Date(selectedItem.created_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>
                  {selectedItem.processed_at && <tr><td style={{ fontWeight: 500 }}>Processed</td><td className="cell-mono">{new Date(selectedItem.processed_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 'var(--sp-2)' }}>
                Event Payload JSONB
              </div>
              <pre style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--sp-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                overflow: 'auto',
                maxHeight: '280px',
              }}>
                {JSON.stringify(selectedItem.payload, null, 2)}
              </pre>
            </div>

            <div className="modal-actions">
              {selectedItem.status === 'failed' && (
                <button
                  className="btn btn-primary"
                  onClick={(e) => { handleReprocess(selectedItem.id, e); setSelectedItem(null); }}
                >
                  Reprocess Task
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setSelectedItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
