/**
 * Tab de Tokens dentro de Sistema.
 * Migrado desde pages/tokens/list.tsx — texto en español.
 */
import { useList } from "@refinedev/core";
import { useState } from "react";
import { useToast } from "../../../components/toast";
import { API_URL } from "../../../providers/constants";
import { getAuthHeader } from "../../../providers/auth";

interface RevokedToken {
  jti: string;
  tenant_id: string;
  revoked_at: string;
  revoked_by: string;
}

export function TokensTab() {
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
      addToast("JTI y Tenant ID son obligatorios", "error");
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

      addToast("Token revocado", "success");
      setJti("");
      setTenantId("");
      setShowForm(false);
      query?.refetch?.();
    } catch (err) {
      addToast(`Error al revocar: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      {/* Acción de revocar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          {total} token{total !== 1 ? 's' : ''} revocado{total !== 1 ? 's' : ''}
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm(!showForm)}
          id="revoke-token-button"
        >
          {showForm ? 'Cancelar' : '+ Revocar token'}
        </button>
      </div>

      {/* Formulario de revocación */}
      {showForm && (
        <div className="data-table-wrapper" style={{ marginBottom: 'var(--sp-5)', maxWidth: '600px', padding: 'var(--sp-4)' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-3)' }}>Revocar un token</div>
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
              {isSubmitting ? 'Revocando…' : 'Revocar token'}
            </button>
          </div>
        </div>
      )}

      {query.isError && <div className="error-banner">{query.error?.message || "Error al cargar tokens"}</div>}

      {query.isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">Sin tokens revocados</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>JTI</th>
                <th>Tenant</th>
                <th>Revocado</th>
                <th>Por</th>
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
