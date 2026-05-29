/**
 * Tab de Jobs dentro de Operaciones.
 * Migrado desde pages/jobs/list.tsx — todo el texto en español,
 * emojis reemplazados por texto funcional.
 */
import { useList } from "@refinedev/core";
import { Link } from "react-router";
import { useState } from "react";
import { useToast } from "../../../components/toast";
import { API_URL } from "../../../providers/constants";
import { getAuthHeader } from "../../../providers/auth";

interface Job {
  id: string;
  name: string;
  state: string;
  data: Record<string, unknown>;
  created_on: string;
  started_on: string | null;
  completed_on: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  description: string | null;
}

const STATE_BADGE: Record<string, string> = {
  active: "badge-info",
  completed: "badge-success",
  failed: "badge-danger",
  expired: "badge-warning",
  cancelled: "badge-neutral",
  retry: "badge-warning",
  created: "badge-neutral",
};

const STATE_FILTERS = ["", "active", "completed", "failed", "expired", "cancelled"];

const STATE_LABELS: Record<string, string> = {
  "": "Todos",
  active: "Activos",
  completed: "Completados",
  failed: "Fallidos",
  expired: "Expirados",
  cancelled: "Cancelados",
};

export function JobsTab() {
  const [stateFilter, setStateFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeState, setPurgeState] = useState("all_finished");
  const [isPurging, setIsPurging] = useState(false);
  const { addToast } = useToast();

  const filters = [];
  if (stateFilter) filters.push({ field: "state", operator: "eq" as const, value: stateFilter });
  if (searchFilter) filters.push({ field: "search", operator: "eq" as const, value: searchFilter });

  const { query, result } = useList<Job>({
    resource: "jobs",
    pagination: { pageSize: 50 },
    filters,
  });

  const jobs = result.data ?? [];

  function formatDuration(start: string | null, end: string | null): string {
    if (!start) return '—';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const ms = e - s;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  const handlePurgeJobs = async () => {
    setIsPurging(true);
    try {
      const resp = await fetch(
        `${API_URL}/admin/jobs?state=${purgeState}&confirm=true`,
        { method: "DELETE", headers: { ...getAuthHeader() } }
      );
      if (!resp.ok) throw new Error(await resp.text());
      const res = await resp.json();
      addToast(`${res.purgedCount} jobs purgados correctamente`, "success");
      setShowPurgeModal(false);
      query.refetch();
    } catch (err) {
      addToast(`Error al purgar: ${(err as Error).message}`, "error");
    } finally {
      setIsPurging(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      if (jobs.length === 0) return;
      const headers = ["ID", "Nombre", "Estado", "Creado", "Iniciado", "Completado", "Tenant ID"];
      const rows = jobs.map((j: Job) => [
        j.id, j.name, j.state, j.created_on,
        j.started_on || "", j.completed_on || "",
        (j.data?.tenant_id as string) || ""
      ]);
      const csvContent = [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `jarvis-jobs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* Acciones */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
          {STATE_FILTERS.map((state) => (
            <button
              key={state}
              className={`btn btn-sm ${stateFilter === state ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStateFilter(state)}
            >
              {STATE_LABELS[state] || state}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          <input
            className="form-input"
            type="text"
            placeholder="Buscar por tenant…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{ maxWidth: '240px' }}
            id="job-search-filter"
          />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowPurgeModal(true)}
            id="purge-jobs-button"
            style={{ color: 'var(--danger)' }}
          >
            Purgar
          </button>
          {jobs.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExportCSV}
              disabled={exporting}
              id="export-jobs-button"
            >
              {exporting ? "Exportando…" : "Exportar CSV"}
            </button>
          )}
        </div>
      </div>

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Error al cargar jobs"}
        </div>
      )}

      {query.isLoading ? (
        <div className="data-table-wrapper" aria-label="Cargando jobs…">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">
            No se encontraron jobs{stateFilter ? ` con estado "${STATE_LABELS[stateFilter] || stateFilter}"` : ""}.
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Creado</th>
                <th>Duración</th>
                <th>Tenant</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: Job) => (
                <tr
                  key={job.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedJob(job)}
                >
                  <td style={{ verticalAlign: 'middle' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{job.name}</div>
                    {job.description && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 'var(--sp-1)' }}>
                        {job.description}
                      </div>
                    )}
                  </td>
                  <td style={{ verticalAlign: 'middle' }}>
                    <span className={`badge ${STATE_BADGE[job.state] || "badge-neutral"}`}>
                      {job.state}
                    </span>
                  </td>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                    {new Date(job.created_on).toLocaleString("es-CL", { hour12: false,
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="cell-mono" style={{ verticalAlign: 'middle' }}>
                    {formatDuration(job.started_on, job.completed_on)}
                  </td>
                  <td style={{ verticalAlign: 'middle' }}>
                    {job.tenant_id ? (
                      <Link
                        to={`/usuarios/${job.tenant_id}`}
                        style={{
                          fontWeight: 500,
                          color: 'var(--accent)',
                          textDecoration: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {job.tenant_name || job.tenant_id.substring(0, 8)}
                      </Link>
                    ) : (
                      <span className="cell-mono" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                        {job.id ? `${job.id.substring(0, 8)}…` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de detalle de job */}
      {selectedJob && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedJob(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-detail-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h2 className="modal-title" id="job-detail-title">
              {selectedJob.name}
            </h2>
            {selectedJob.description && (
              <p style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--sp-4)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderLeft: '4px solid var(--accent)',
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--radius-sm)',
              }}>
                {selectedJob.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
              <span className={`badge ${STATE_BADGE[selectedJob.state] || 'badge-neutral'}`}>
                {selectedJob.state}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {selectedJob.id}
              </span>
            </div>

            <div className="data-table-wrapper" style={{ marginBottom: 'var(--sp-4)' }}>
              <table className="data-table">
                <tbody>
                  <tr><td style={{ fontWeight: 500, width: '120px' }}>Creado</td><td className="cell-mono">{new Date(selectedJob.created_on).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>
                  {selectedJob.started_on && <tr><td style={{ fontWeight: 500 }}>Iniciado</td><td className="cell-mono">{new Date(selectedJob.started_on).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>}
                  {selectedJob.completed_on && <tr><td style={{ fontWeight: 500 }}>Completado</td><td className="cell-mono">{new Date(selectedJob.completed_on).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>}
                  <tr><td style={{ fontWeight: 500 }}>Duración</td><td className="cell-mono">{formatDuration(selectedJob.started_on, selectedJob.completed_on)}</td></tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 'var(--sp-2)' }}>
                Datos del Job
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
                maxHeight: '200px',
              }}>
                {JSON.stringify(selectedJob.data, null, 2)}
              </pre>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setSelectedJob(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de purga */}
      {showPurgeModal && (
        <div
          className="modal-overlay"
          onClick={() => { if (!isPurging) setShowPurgeModal(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-jobs-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 className="modal-title" id="purge-jobs-title" style={{ color: 'var(--danger)' }}>
              Purgar Jobs Finalizados
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--sp-4)' }}>
              Esta operación eliminará permanentemente los jobs seleccionados de la base de datos. Los jobs activos, creados y en reintento no se verán afectados.
            </p>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label htmlFor="purge-state-select" className="form-label" style={{ fontWeight: 500, display: 'block', marginBottom: 'var(--sp-2)' }}>
                Seleccionar jobs a purgar:
              </label>
              <select
                id="purge-state-select"
                className="form-input"
                value={purgeState}
                onChange={(e) => setPurgeState(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="all_finished">Todos los finalizados (completados, fallidos, cancelados)</option>
                <option value="completed">Solo completados</option>
                <option value="failed">Solo fallidos</option>
                <option value="cancelled">Solo cancelados</option>
              </select>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowPurgeModal(false)} disabled={isPurging} id="cancel-purge-jobs">
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={handlePurgeJobs}
                disabled={isPurging}
                id="confirm-purge-jobs"
              >
                {isPurging ? "Purgando…" : "Purgar Jobs"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
