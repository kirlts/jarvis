/**
 * Token Management Page — I.1, I.2
 *
 * Features:
 * - List of revoked tokens with pagination
 * - Revoke token form (JTI + Tenant ID)
 * - Toast notifications
 */
import { useList } from "@refinedev/core";
import { useState } from "react";
import { useToast } from "../../components/toast";
import { API_URL } from "../../providers/constants";
import { getAuthHeader } from "../../providers/auth";

interface RevokedToken {
  jti: string;
  tenant_id: string;
  revoked_at: string;
  revoked_by: string;
}

export function TokenManagementPage() {
  const { addToast } = useToast();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [jti, setJti] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pageSize = 50;

  const { query, result } = useList<RevokedToken>({
    resource: "tokens",
    pagination: { currentPage: page, pageSize },
  });

  const tokens = result.data ?? [];
  const total = result.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  async function handleRevoke() {
    if (!jti.trim() || !tenantId.trim()) {
      addToast("JTI and Tenant ID are required", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const resp = await fetch(`${API_URL}/admin/tokens/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ jti: jti.trim(), tenant_id: tenantId.trim() }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || body.message || `HTTP ${resp.status}`);
      }

      addToast("Token revoked", "success");
      setJti("");
      setTenantId("");
      setShowForm(false);
      query?.refetch?.();
    } catch (err) {
      addToast(`Revocation failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Token Management</h1>
          <p className="page-subtitle">{total} revoked token{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
          id="revoke-token-button"
        >
          {showForm ? 'Cancel' : '+ Revoke Token'}
        </button>
      </div>

      {/* Revoke form */}
      {showForm && (
        <div className="dashboard-card" style={{ marginBottom: 'var(--sp-5)', maxWidth: '600px', cursor: 'default' }}>
          <div className="dashboard-card-label" style={{ marginBottom: 'var(--sp-3)' }}>Revoke a Token</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="revoke-jti">Token JTI (UUID)</label>
              <input
                className="form-input" type="text" id="revoke-jti"
                value={jti} onChange={(e) => setJti(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="revoke-tenant">Tenant ID (UUID)</label>
              <input
                className="form-input" type="text" id="revoke-tenant"
                value={tenantId} onChange={(e) => setTenantId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
              />
            </div>
            <button
              className="btn btn-danger"
              onClick={handleRevoke}
              disabled={isSubmitting}
              id="confirm-revoke-button"
            >
              {isSubmitting ? 'Revoking…' : 'Revoke Token'}
            </button>
          </div>
        </div>
      )}

      {query.isError && <div className="error-banner">{query.error?.message || "Failed to load tokens"}</div>}

      {query.isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔑</div>
          <p className="empty-state-text">No revoked tokens</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>JTI</th>
                <th>Tenant</th>
                <th>Revoked At</th>
                <th>Revoked By</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.jti}>
                  <td className="cell-mono" style={{ fontSize: 'var(--text-xs)' }}>{t.jti}</td>
                  <td className="cell-mono" style={{ fontSize: 'var(--text-xs)' }}>{t.tenant_id.substring(0, 8)}…</td>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(t.revoked_at).toLocaleString("es-CL", { hour12: false, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td>{t.revoked_by}</td>
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
    </div>
  );
}
