/**
 * Audit Trail Page — H.1, H.2, H.3
 *
 * Paginated list of admin operations with action/resource filters.
 * Provides CSV/JSON export capability.
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

export function AuditListPage() {
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
      downloadBlob(blob, `audit-export-${Date.now()}.json`);
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
      downloadBlob(blob, `audit-export-${Date.now()}.csv`);
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-subtitle">{total} entries</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportData('csv')} id="export-csv">
            Export CSV
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportData('json')} id="export-json">
            Export JSON
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select
          className="form-input"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          id="audit-action-filter"
        >
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="status_change">Status Change</option>
          <option value="restore">Restore</option>
        </select>
        <select
          className="form-input"
          value={resourceFilter}
          onChange={(e) => { setResourceFilter(e.target.value); setPage(1); }}
          id="audit-resource-filter"
        >
          <option value="">All resources</option>
          <option value="tenant">Tenant</option>
        </select>
      </div>

      {query.isError && (
        <div className="error-banner">{query.error?.message || "Failed to load audit log"}</div>
      )}

      {query.isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <p className="empty-state-text">No audit entries found</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Actor</th>
                <th>Details</th>
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
                      {entry.action}
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
              <span>Page {page} of {totalPages} ({total} total)</span>
              <div className="pagination-buttons">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
