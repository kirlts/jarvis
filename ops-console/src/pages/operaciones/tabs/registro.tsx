/**
 * Tab de Registro (auditoría) dentro de Operaciones.
 * Migrado desde pages/audit/list.tsx — texto en español.
 */
import { useList } from "@refinedev/core";
import { useState } from "react";

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_BADGE: Record<string, string> = {
  create: "badge-success",
  update: "badge-info",
  delete: "badge-danger",
  status_change: "badge-warning",
  restore: "badge-info",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Creación",
  update: "Actualización",
  delete: "Eliminación",
  status_change: "Cambio de estado",
  restore: "Restauración",
};

export function RegistroTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const pageSize = 50;

  const filters = [];
  if (actionFilter) filters.push({ field: "action", operator: "eq" as const, value: actionFilter });
  if (resourceFilter) filters.push({ field: "resource", operator: "eq" as const, value: resourceFilter });

  const { query, result } = useList<AuditEntry>({
    resource: "audit",
    pagination: { currentPage: page, pageSize },
    filters,
  });

  const entries = result.data ?? [];
  const total = result.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function exportData(format: 'json' | 'csv') {
    if (!entries.length) return;

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `registro-export-${Date.now()}.json`);
    } else {
      const headers = ['id', 'actor', 'action', 'resource', 'resource_id', 'details', 'created_at'];
      const rows = entries.map(e =>
        headers.map(h => {
          const val = e[h as keyof AuditEntry];
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return String(val);
        }).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      downloadBlob(blob, `registro-export-${Date.now()}.csv`);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Acciones y filtros */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <select
            className="form-input"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            id="audit-action-filter"
          >
            <option value="">Todas las acciones</option>
            <option value="create">Creación</option>
            <option value="update">Actualización</option>
            <option value="delete">Eliminación</option>
            <option value="status_change">Cambio de estado</option>
            <option value="restore">Restauración</option>
          </select>
          <select
            className="form-input"
            value={resourceFilter}
            onChange={(e) => { setResourceFilter(e.target.value); setPage(1); }}
            id="audit-resource-filter"
          >
            <option value="">Todos los recursos</option>
            <option value="tenant">Tenant</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportData('csv')} id="export-csv">
            Exportar CSV
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportData('json')} id="export-json">
            Exportar JSON
          </button>
        </div>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--sp-3)' }}>
        {total} entradas
      </p>

      {query.isError && (
        <div className="error-banner">{query.error?.message || "Error al cargar el registro"}</div>
      )}

      {query.isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">Sin entradas de registro</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Recurso</th>
                <th>Actor</th>
                <th>Detalles</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(entry.created_at).toLocaleString("es-CL", { hour12: false,
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </td>
                  <td>
                    <span className={`badge ${ACTION_BADGE[entry.action] || 'badge-neutral'}`}>
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{entry.resource}</span>
                    {entry.resource_id && (
                      <span className="cell-mono" style={{ display: 'block', fontSize: 'var(--text-xs)' }}>
                        {entry.resource_id.substring(0, 8)}…
                      </span>
                    )}
                  </td>
                  <td>{entry.actor}</td>
                  <td className="cell-mono" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.details ? JSON.stringify(entry.details) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <span>Página {page} de {totalPages} ({total} total)</span>
              <div className="pagination-buttons">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
