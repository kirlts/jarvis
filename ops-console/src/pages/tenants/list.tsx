import { useList, useDelete, useNavigation } from "@refinedev/core";
import { useState } from "react";

interface Tenant {
  id: string;
  name: string;
  created_at: string;
  deleted_at: string | null;
}

export function TenantListPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { query, result } = useList<Tenant>({
    resource: "tenants",
    pagination: { currentPage: page, pageSize },
  });

  const { mutate: deleteTenant } = useDelete();
  const { create } = useNavigation();

  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const tenants = result.data ?? [];
  const total = result.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    deleteTenant(
      { resource: "tenants", id: deleteTarget.id },
      {
        onSuccess: () => {
          setDeleteTarget(null);
          setIsDeleting(false);
        },
        onError: () => {
          setIsDeleting(false);
        },
      }
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-subtitle">
            {total} tenant{total !== 1 ? "s" : ""} registered
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => create("tenants")}
          id="create-tenant-button"
        >
          + New Tenant
        </button>
      </div>

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Failed to load tenants"}
        </div>
      )}

      {query.isLoading ? (
        <div className="loading">
          <div className="loading-spinner" />
          Loading tenants…
        </div>
      ) : tenants.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <p className="empty-state-text">No tenants yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Created</th>
                <th className="cell-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant: Tenant) => (
                <tr key={tenant.id}>
                  <td className="cell-mono">{tenant.id}</td>
                  <td>{tenant.name}</td>
                  <td className="cell-mono">
                    {new Date(tenant.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="cell-actions">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteTarget(tenant)}
                      id={`delete-tenant-${tenant.id}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <span>
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="pagination-buttons">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Prev
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal (OPER.IN.01) */}
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
              Delete Tenant
            </h2>
            <p className="modal-body">
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.name}</strong>? This action will soft-delete
              the tenant and cannot be easily reversed.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                id="cancel-delete-button"
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
                id="confirm-delete-button"
              >
                {isDeleting ? "Deleting…" : "Delete Tenant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
