/**
 * Storage Browser Page — E.1 through E.4
 *
 * Features:
 * - Storage summary cards (active/pending/deleted, total bytes)
 * - File list with search, status filter, tenant filter
 * - Size formatting
 * - Skeleton loading
 * - Selection-based bulk actions (Delete, ZIP Download)
 * - File previews (audio, images) and individual download
 */
import { useList, useCustom, useCustomMutation, useNotification } from "@refinedev/core";
import { useState, useEffect, useCallback } from "react";
import { useWhatsAppSSE } from "../../hooks/useWhatsAppSSE";

interface StorageObject {
  id: string;
  tenant_id: string;
  file_name: string;
  size: number;
  mime_type: string;
  storage_key: string;
  status: string;
  created_at: string;
  deleted_at: string | null;
}

interface StorageSummary {
  active_files: number;
  pending_files: number;
  deleted_files: number;
  active_bytes: string;
  tenants_with_files: number;
}

const STATUS_BADGE: Record<string, string> = {
  uploaded: "badge-success",
  pending: "badge-warning",
  deleted: "badge-danger",
};

function truncateFilename(name: string, maxLen: number = 30): string {
  if (name.length <= maxLen) return name;
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx === -1) return name.substring(0, maxLen - 3) + '…';
  const ext = name.substring(dotIdx); // includes dot
  const base = name.substring(0, dotIdx);
  const available = maxLen - ext.length - 1; // 1 for the ellipsis
  if (available < 4) return name.substring(0, maxLen - 3) + '…';
  return base.substring(0, available) + '…' + ext;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function resolveBrowserUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (['storage', 'localhost', '127.0.0.1'].includes(parsed.hostname)) {
      parsed.hostname = window.location.hostname;
    }
    return parsed.toString();
  } catch (_) {
    return url;
  }
}

export function StorageBrowserPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  const pageSize = 50;
  const { open } = useNotification();

  const filters = [];
  if (search) filters.push({ field: "search", operator: "eq" as const, value: search });
  if (statusFilter) filters.push({ field: "status", operator: "eq" as const, value: statusFilter });
  if (tenantFilter) filters.push({ field: "tenant_id", operator: "eq" as const, value: tenantFilter });

  const { result: tenantsResult } = useList({
    resource: "tenants",
    pagination: { mode: "off" }
  });
  const tenants = tenantsResult?.data || [];

  const { query, result } = useList<StorageObject>({
    resource: "storage",
    pagination: { currentPage: page, pageSize },
    filters,
  });

  // SSE-driven reactivity: refetch on new storage objects
  const handleSSE = useCallback((event: any) => {
    if ((event as any)._eventType === 'activity_update') {
      query.refetch();
    }
  }, [query]);
  useWhatsAppSSE(handleSSE);

  const { result: summaryResult } = useCustom<StorageSummary>({
    url: '', method: 'get',
    meta: { rawUrl: '/admin/storage/summary' },
    queryOptions: { queryKey: ['storage-summary'] },
  });

  const { mutate: mutateCustom } = useCustomMutation();

  const files = result.data ?? [];
  const total = result.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const summary = summaryResult?.data as StorageSummary | undefined;

  // Fetch batch presigned URLs for uploaded files
  useEffect(() => {
    const fetchUrls = async () => {
      const idsToFetch = files
        .filter(f => f.status === 'uploaded' && !presignedUrls[f.id])
        .map(f => f.id);
        
      if (idsToFetch.length > 0) {
        mutateCustom({
          url: '',
          method: 'post',
          meta: { rawUrl: '/admin/storage/batch-urls' },
          values: { ids: idsToFetch }
        }, {
          onSuccess: (data: any) => {
            const urlsMap = { ...presignedUrls };
            data.data.forEach((item: any) => {
              const fixedUrl = resolveBrowserUrl(item.url);
              urlsMap[item.id] = fixedUrl || "";
            });
            setPresignedUrls(urlsMap);
          }
        });
      }
    };
    fetchUrls();
  }, [files]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedIds.length === files.length && files.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(files.map(f => f.id));
    }
  };

  const handleBulkDelete = () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} files?`)) return;
    
    mutateCustom({
      url: '',
      method: 'post',
      meta: { rawUrl: '/admin/storage/bulk-delete' },
      values: { ids: selectedIds, confirm: true }
    }, {
      onSuccess: () => {
        open?.({ type: 'success', message: 'Files deleted', description: `Deleted ${selectedIds.length} files.` });
        setSelectedIds([]);
        query.refetch();
      },
      onError: (err) => {
        open?.({ type: 'error', message: 'Deletion failed', description: err.message });
      }
    });
  };

  const handleBulkDownload = () => {
    mutateCustom({
      url: '',
      method: 'post',
      meta: { rawUrl: '/admin/storage/bulk-download' },
      values: { ids: selectedIds }
    }, {
      onSuccess: (data: any) => {
        open?.({ type: 'success', message: 'ZIP Job Enqueued', description: `Job ID: ${data.data.jobId}` });
        setSelectedIds([]);
      },
      onError: (err) => {
        open?.({ type: 'error', message: 'ZIP creation failed', description: err.message });
      }
    });
  };

  const handleSingleDownload = (id: string) => {
    if (presignedUrls[id]) {
      const a = document.createElement('a');
      a.href = presignedUrls[id];
      a.target = '_blank';
      a.download = '';
      a.click();
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Storage</h1>
          <p className="page-subtitle">{total} objetos</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="dashboard-grid" style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="dashboard-card" style={{ cursor: 'default' }}>
          <div className="dashboard-card-label">Archivos activos</div>
          <div className="dashboard-card-value">{summary?.active_files ?? '–'}</div>
          <div className="dashboard-card-sub">{formatBytes(Number(summary?.active_bytes || 0))}</div>
        </div>
        <div className="dashboard-card" style={{ cursor: 'default' }}>
          <div className="dashboard-card-label">Pendientes</div>
          <div className="dashboard-card-value">{summary?.pending_files ?? '–'}</div>
        </div>
        <div className="dashboard-card" style={{ cursor: 'default' }}>
          <div className="dashboard-card-label">Eliminados</div>
          <div className="dashboard-card-value">{summary?.deleted_files ?? '–'}</div>
          <div className="dashboard-card-sub">{summary?.tenants_with_files ?? 0} tenants con archivos</div>
        </div>
      </div>

      {/* Filters & Bulk Actions */}
      <div className="filter-bar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', flex: 1, minWidth: '300px' }}>
          <div className="search-input-wrapper" style={{ flex: 1 }}>
            <span className="search-icon">⌕</span>
            <input
              className="form-input" type="text"
              placeholder="Buscar por nombre de archivo…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              id="storage-search"
            />
          </div>
          <select
            className="form-input"
            value={tenantFilter}
            onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
            id="storage-tenant-filter"
          >
            <option value="">Todos los tenants</option>
            {tenants.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            id="storage-status-filter"
          >
            <option value="">Todos los estados</option>
            <option value="uploaded">Subido</option>
            <option value="pending">Pendiente</option>
            <option value="deleted">Eliminado</option>
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{selectedIds.length} seleccionados</span>
            <button className="btn btn-primary" onClick={handleBulkDownload}>Descargar ZIP</button>
            <button className="btn btn-danger" onClick={handleBulkDelete}>Eliminar</button>
          </div>
        )}
      </div>

      {query.isError && <div className="error-banner">{query.error?.message || "Error al cargar storage"}</div>}

      {query.isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">Sin objetos de storage</p>
        </div>
      ) : (
        <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" onChange={toggleAll} checked={selectedIds.length === files.length && files.length > 0} />
                </th>
                <th>Archivo</th>
                <th>Estado</th>
                <th>Tamaño</th>
                <th>Tipo</th>
                <th>Tenant</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const url = presignedUrls[f.id];
                const isAudio = f.mime_type.startsWith('audio/');
                const isImage = f.mime_type.startsWith('image/');
                const isVideo = f.mime_type.startsWith('video/');
                const isPdf = f.mime_type === 'application/pdf';
                const isDeleted = f.status === 'deleted';
                const isExpanded = expandedIds.has(f.id);
                const hasPreview = url && !isDeleted && (isAudio || isImage || isVideo || isPdf);

                const toggleExpand = () => {
                  if (!hasPreview) return;
                  setExpandedIds(prev => {
                    const next = new Set(prev);
                    next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                    return next;
                  });
                };

                return (
                  <tr
                    key={f.id}
                    className={selectedIds.includes(f.id) ? 'selected-row' : ''}
                    onClick={toggleExpand}
                    style={{ cursor: hasPreview ? 'pointer' : 'default' }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(f.id)} 
                        onChange={() => toggleSelection(f.id)} 
                        disabled={isDeleted}
                      />
                    </td>
                    <td style={{ maxWidth: '400px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', userSelect: 'none' }}>
                        {hasPreview && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        )}
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.file_name}>
                          {truncateFilename(f.file_name)}
                        </span>
                      </div>
                      {isExpanded && url && (
                        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 'var(--sp-2)', padding: 'var(--sp-2)', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          {isImage && <img src={url} alt={f.file_name} style={{ maxWidth: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }} />}
                          {isAudio && <audio controls src={url} style={{ width: '100%', height: '40px' }} />}
                          {isVideo && <video controls src={url} style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: 'var(--radius-sm)' }} />}
                          {isPdf && (
                            <iframe
                              src={url}
                              style={{ width: '100%', height: '300px', border: 'none', borderRadius: 'var(--radius-sm)' }}
                              title={f.file_name}
                            />
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[f.status] || 'badge-neutral'}`}>{f.status}</span>
                    </td>
                    <td className="cell-mono">{formatBytes(f.size)}</td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{f.mime_type}</td>
                    <td className="cell-mono" style={{ fontSize: 'var(--text-xs)' }}>
                      {tenants.find((t: any) => t.id === f.tenant_id)?.name || f.tenant_id.substring(0, 8) + '…'}
                    </td>
                    <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="btn btn-ghost btn-sm" 
                        disabled={!url || isDeleted} 
                        onClick={() => handleSingleDownload(f.id)}
                        title="Descargar"
                      >
                        ⬇️
                      </button>
                    </td>
                  </tr>
                );
              })}
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
    </div>
  );
}
