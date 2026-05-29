/**
 * Tenant List Page — B.1, B.2, B.4
 *
 * Features:
 * - Search by name (B.1)
 * - Filter by status: active, suspended, trial, deleted (B.2)
 * - Status badges with semantic colors (B.4)
 * - Soft-delete with confirmation modal (B.4)
 * - Toast notifications on success/error
 * - Skeleton loading state
 */
import { useList, useDelete, useNavigation, useUpdate } from "@refinedev/core";
import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useToast } from "../../components/toast";
import { API_URL } from "../../providers/constants";
import { getAuthHeader } from "../../providers/auth";

interface Tenant {
  id: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  active: "badge-success",
  suspended: "badge-warning",
  trial: "badge-info",
  deleted: "badge-danger",
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  { value: "active", label: "Activo" },
  { value: "suspended", label: "Suspendido" },
  { value: "trial", label: "Prueba" },
  { value: "deleted", label: "Eliminado" },
];

export function TenantListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const pageSize = 20;
  const navigate = useNavigate();
  const { addToast } = useToast();

  const filters = [];
  if (search) filters.push({ field: "search", operator: "eq" as const, value: search });
  if (statusFilter) filters.push({ field: "status", operator: "eq" as const, value: statusFilter });

  const { query, result } = useList<Tenant>({
    resource: "tenants",
    pagination: { currentPage: page, pageSize },
    filters,
  });

  const { mutate: deleteTenant } = useDelete();
  const { mutate: updateTenant } = useUpdate();
  const { create } = useNavigation();

  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<Tenant | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [exporting, setExporting] = useState(false);

  const tenants = result.data ?? [];
  const total = result.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    deleteTenant(
      { resource: "tenants", id: deleteTarget.id },
      {
        onSuccess: () => {
          addToast(`"${deleteTarget.name}" eliminado`, "success");
          setDeleteTarget(null);
          setIsDeleting(false);
          query.refetch();
        },
        onError: (err) => {
          addToast(`Error al eliminar: ${err.message}`, "error");
          setIsDeleting(false);
        },
      }
    );
  }, [deleteTarget, deleteTenant, addToast, query]);

  const handleRestore = useCallback(async (tenant: Tenant) => {
    try {
      const resp = await fetch(
        `${API_URL}/admin/tenants/${tenant.id}/restore`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          body: JSON.stringify({}),
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      addToast(`"${tenant.name}" restaurado`, "success");
      query.refetch();
    } catch (err) {
      addToast(`Error al restaurar: ${(err as Error).message}`, "error");
    }
  }, [query, addToast]);

  const handlePurge = useCallback(() => {
    if (!purgeTarget) return;
    setIsPurging(true);
    deleteTenant(
      {
        resource: "tenants",
        id: purgeTarget.id,
        meta: { purge: true },
      },
      {
        onSuccess: () => {
          addToast(`"${purgeTarget.name}" purgado permanentemente`, "success");
          setPurgeTarget(null);
          setIsPurging(false);
          query.refetch();
        },
        onError: (err) => {
          addToast(`Error al purgar: ${err.message}`, "error");
          setIsPurging(false);
        },
      }
    );
  }, [purgeTarget, deleteTenant, addToast, query]);

  const handleStatusChange = useCallback((tenant: Tenant, newStatus: string) => {
    updateTenant(
      {
        resource: "tenants",
        id: tenant.id,
        values: { status: newStatus },
      },
      {
        onSuccess: () => {
          addToast(`"${tenant.name}" → ${newStatus}`, "success");
        },
        onError: (err) => {
          addToast(`Error al cambiar estado: ${err.message}`, "error");
        },
      }
    );
  }, [updateTenant, addToast]);

  // Debounced search
  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "1000");
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const resp = await fetch(`${API_URL}/admin/tenants?${params.toString()}`, {
        headers: getAuthHeader(),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const res = await resp.json();
      const list = res.data || [];
      
      if (list.length === 0) {
        addToast("Sin usuarios para exportar", "info");
        return;
      }

      // Format CSV
      const headers = ["ID", "Name", "Status", "Created At", "Deleted At"];
      const rows = list.map((t: Tenant) => [
        t.id,
        `"${t.name.replace(/"/g, '""')}"`,
        t.deleted_at ? "deleted" : t.status,
        t.created_at,
        t.deleted_at || ""
      ]);

      const csvContent = [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `jarvis-tenants-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast(`${list.length} usuarios exportados`, "success");
    } catch (err) {
      addToast(`Error al exportar: ${(err as Error).message}`, "error");
    } finally {
      setExporting(false);
    }
  }, [search, statusFilter, addToast]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">
            {total} usuario{total !== 1 ? "s" : ""} {statusFilter ? `(${statusFilter})` : ""}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleExportCSV}
            disabled={exporting}
            id="export-tenants-button"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
          >
            {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/usuarios/crear')}
            id="create-tenant-button"
          >
            + Nuevo usuario
          </button>
        </div>
      </div>

      {/* Filter bar (B.1, B.2) */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">⌕</span>
          <input
            className="form-input"
            type="text"
            placeholder="Buscar usuarios…"
            value={search}
            onChange={handleSearchInput}
            id="tenant-search-input"
          />
        </div>
        <select
          className="form-input"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          id="tenant-status-filter"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Error al cargar usuarios"}
        </div>
      )}

      {query.isLoading ? (
        <div className="data-table-wrapper" aria-label="Cargando usuarios…">
          <div style={{ display: 'none' }}>Cargando usuarios…</div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">
            {search ? `Sin resultados para "${search}"` : "Sin usuarios aún. Crea uno para comenzar."}
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>ID</th>
                <th>Creado</th>
                <th className="cell-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant: Tenant) => (
                <tr
                  key={tenant.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/usuarios/${tenant.id}`)}
                >
                  <td style={{ fontWeight: 500 }}>{tenant.name}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[tenant.deleted_at ? 'deleted' : tenant.status] || 'badge-neutral'}`}>
                      {tenant.deleted_at ? "eliminado" : tenant.status}
                    </span>
                  </td>
                  <td className="cell-mono">{tenant.id.substring(0, 8)}…</td>
                  <td className="cell-mono">
                    {new Date(tenant.created_at).toLocaleDateString("es-CL", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    {!tenant.deleted_at && tenant.status === "active" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleStatusChange(tenant, "suspended")}
                        title="Suspender usuario"
                      >
                        Suspender
                      </button>
                    )}
                    {!tenant.deleted_at && tenant.status === "suspended" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleStatusChange(tenant, "active")}
                        title="Activar usuario"
                      >
                        Activar
                      </button>
                    )}
                    {!tenant.deleted_at && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(tenant)}
                        id={`delete-tenant-${tenant.id}`}
                      >
                        Eliminar
                      </button>
                    )}
                    {tenant.deleted_at && (
                      <>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRestore(tenant)}
                          title="Restaurar usuario"
                          id={`restore-tenant-${tenant.id}`}
                        >
                          Restaurar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setPurgeTarget(tenant)}
                          id={`purge-tenant-${tenant.id}`}
                          title="Purgar permanentemente"
                        >
                          Purgar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <span>
                Página {page} de {totalPages} ({total} total)
              </span>
              <div className="pagination-buttons">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Anterior
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="modal-overlay"
          onClick={() => !isDeleting && setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title" id="delete-modal-title">
              Eliminar usuario
            </h2>
            <p className="modal-body">
              ¿Eliminar{" "}
              <strong>{deleteTarget.name}</strong>? Esta acción aplica soft-delete.
              Se puede restaurar después.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                id="cancel-delete-button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
                id="confirm-delete-button"
              >
                {isDeleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge confirmation modal */}
      {purgeTarget && (
        <div
          className="modal-overlay"
          onClick={() => !isPurging && setPurgeTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-modal-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title" id="purge-modal-title" style={{ color: "var(--color-danger)" }}>
              Purgar permanentemente
            </h2>
            <p className="modal-body">
              ¿Purgar permanentemente{" "}
              <strong>{purgeTarget.name}</strong>? Esta acción eliminará
              el usuario y todos sus datos asociados de forma irreversible.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setPurgeTarget(null)}
                disabled={isPurging}
                id="cancel-purge-button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={handlePurge}
                disabled={isPurging}
                id="confirm-purge-button"
              >
                {isPurging ? "Purgando…" : "Purgar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
