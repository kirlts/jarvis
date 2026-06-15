/**
 * BandejaTab — Inbox monitoring tab within Operaciones.
 *
 * Displays paginated sync_inbox items with status filters,
 * detail modal, and reprocess/rollback actions.
 * Adapted from pages/inbox/list.tsx for tab embedding.
 */
import { useList } from "@refinedev/core";
import { useState, useCallback } from "react";
import { useToast } from "../../../components/toast";
import { API_URL } from "../../../providers/constants";
import { getAuthHeader } from "../../../providers/auth";

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

export function BandejaTab() {
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

  const items = result.data ?? [];
  const total = result.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

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
          ? "Elemento encolado para rollback y reprocesamiento"
          : "Elemento encolado para reprocesamiento",
        "success"
      );
      query.refetch();
    } catch (err) {
      addToast(`Acción fallida: ${(err as Error).message}`, "error");
    } finally {
      setReprocessingId(null);
    }
  }, [addToast, query, items]);

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
      addToast(`Error al cargar detalles: ${(err as Error).message}`, "error");
    }
  }, [addToast]);

  return (
    <>
      {/* Filter bar */}
      <div className="filter-bar">
        <select
          className="form-input"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          id="bandeja-status-filter"
          style={{ maxWidth: '200px' }}
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="processing">Procesando</option>
          <option value="done">Completado</option>
          <option value="failed">Fallido</option>
        </select>
        <input
          className="form-input"
          type="text"
          placeholder="Filtrar por tenant ID…"
          value={tenantFilter}
          onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
          style={{ maxWidth: '280px' }}
          id="bandeja-tenant-filter"
        />
      </div>

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Error al cargar la bandeja de entrada"}
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
          <p className="empty-state-text">Sin elementos en la bandeja</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Estado</th>
                <th>Tenant ID</th>
                <th>Creado</th>
                <th>Procesado</th>
                <th className="cell-actions">Acciones</th>
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
                        {reprocessingId === item.id ? "Encolando…" : "🔄 Reprocesar"}
                      </button>
                    )}
                    {item.status === 'done' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={reprocessingId === item.id}
                        onClick={(e) => handleReprocess(item.id, e)}
                        style={{ color: 'var(--warning-subtle)' }}
                      >
                        {reprocessingId === item.id ? "Revirtiendo…" : "⏪ Rollback"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <span>Página {page} de {totalPages}</span>
              <div className="pagination-buttons">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedItem(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bandeja-detail-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h2 className="modal-title" id="bandeja-detail-title">
              Detalle del Elemento
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
                  <tr><td style={{ fontWeight: 500 }}>Creado</td><td className="cell-mono">{new Date(selectedItem.created_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>
                  {selectedItem.processed_at && <tr><td style={{ fontWeight: 500 }}>Procesado</td><td className="cell-mono">{new Date(selectedItem.processed_at).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 'var(--sp-2)' }}>
                Payload JSONB
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
                  Reprocesar
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setSelectedItem(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
