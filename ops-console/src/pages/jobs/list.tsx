/**
 * Job List Page — D.1 through D.6
 *
 * Features:
 * - State filter tabs (D.1)
 * - State badges with semantic colors (D.2)
 * - Job detail modal with JSON data viewer (D.4)
 * - Skeleton loading state
 * - Tenant ID filter
 */
import { useList } from "@refinedev/core";
import { Link } from "react-router";
import { useState, useCallback } from "react";
import { useToast } from "../../components/toast";
import { API_URL } from "../../providers/constants";
import { getAuthHeader } from "../../providers/auth";
import { useWhatsAppSSE } from "../../hooks/useWhatsAppSSE";

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

export function JobListPage() {
  const [stateFilter, setStateFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  // States for jobs purge action
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

  // SSE-driven reactivity: refetch on new jobs
  const handleSSE = useCallback((event: any) => {
    if ((event as any)._eventType === 'activity_update') {
      query.refetch();
    }
  }, [query]);
  useWhatsAppSSE(handleSSE);

  // Count jobs by state for the filter tabs
  const stateCounts: Record<string, number> = {};
  for (const job of jobs) {
    stateCounts[job.state] = (stateCounts[job.state] || 0) + 1;
  }

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
        {
          method: "DELETE",
          headers: {
            ...getAuthHeader(),
          },
        }
      );

      if (!resp.ok) {
        throw new Error(await resp.text());
      }

      const res = await resp.json();
      addToast(
        `Successfully purged ${res.purgedCount} finished jobs from the queue`,
        "success"
      );
      setShowPurgeModal(false);
      query.refetch();
    } catch (err) {
      addToast(`Purge failed: ${(err as Error).message}`, "error");
    } finally {
      setIsPurging(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      if (jobs.length === 0) return;
      const headers = ["ID", "Name", "State", "Created On", "Started On", "Completed On", "Tenant ID"];
      const rows = jobs.map((j: Job) => [
        j.id,
        j.name,
        j.state,
        j.created_on,
        j.started_on || "",
        j.completed_on || "",
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Job Queues</h1>
          <p className="page-subtitle">pg-boss job monitoring — {jobs.length} jobs loaded</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowPurgeModal(true)}
            id="purge-jobs-button"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', color: 'var(--color-danger, #ef4444)' }}
          >
            🗑️ Purge Jobs
          </button>
          {jobs.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExportCSV}
              disabled={exporting}
              id="export-jobs-button"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
            >
              {exporting ? "⏳ Exporting…" : "📥 Export CSV"}
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div style={{ display: "flex", gap: "var(--sp-1)" }}>
          {STATE_FILTERS.map((state) => (
            <button
              key={state}
              className={`btn btn-sm ${stateFilter === state ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStateFilter(state)}
            >
              {state || "All"}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          type="text"
          placeholder="Search by tenant name or ID…"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{ maxWidth: '320px' }}
          id="job-search-filter"
        />
      </div>

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Failed to load jobs"}
        </div>
      )}

      {query.isLoading ? (
        <div className="data-table-wrapper" aria-label="Loading jobs…">
          <div style={{ display: 'none' }}>Loading jobs…</div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⚙️</div>
          <p className="empty-state-text">
            No jobs found{stateFilter ? ` with state "${stateFilter}"` : ""}.
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>State</th>
                <th>Created</th>
                <th>Duration</th>
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
                        to={`/tenants/${job.tenant_id}`}
                        style={{ 
                          fontWeight: 500, 
                          color: 'var(--brand-primary)', 
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--sp-1)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="tenant-link"
                      >
                        🏢 {job.tenant_name || job.tenant_id.substring(0, 8)}
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

      {/* Job detail modal */}
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
                borderLeft: '4px solid var(--brand-primary)',
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
                  <tr><td style={{ fontWeight: 500, width: '120px' }}>Created</td><td className="cell-mono">{new Date(selectedJob.created_on).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>
                  {selectedJob.started_on && <tr><td style={{ fontWeight: 500 }}>Started</td><td className="cell-mono">{new Date(selectedJob.started_on).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>}
                  {selectedJob.completed_on && <tr><td style={{ fontWeight: 500 }}>Completed</td><td className="cell-mono">{new Date(selectedJob.completed_on).toLocaleString("es-CL", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>}
                  <tr><td style={{ fontWeight: 500 }}>Duration</td><td className="cell-mono">{formatDuration(selectedJob.started_on, selectedJob.completed_on)}</td></tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 'var(--sp-2)' }}>
                Job Data
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
              <button className="btn btn-ghost" onClick={() => setSelectedJob(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Purge Jobs Modal */}
      {showPurgeModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isPurging) {
              setShowPurgeModal(false);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-jobs-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 className="modal-title" id="purge-jobs-title" style={{ color: 'var(--color-danger, #ef4444)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              ⚠️ Purge Finished Jobs
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--sp-4)' }}>
              This operation will permanently delete jobs from the database queue. Active, created, and retry jobs will not be affected.
            </p>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label htmlFor="purge-state-select" className="form-label" style={{ fontWeight: 500, display: 'block', marginBottom: 'var(--sp-2)' }}>
                Select Jobs to Purge:
              </label>
              <select
                id="purge-state-select"
                className="form-input"
                value={purgeState}
                onChange={(e) => setPurgeState(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="all_finished">All Finished Jobs (completed, failed, cancelled)</option>
                <option value="completed">Only Completed Jobs</option>
                <option value="failed">Only Failed Jobs</option>
                <option value="cancelled">Only Cancelled Jobs</option>
              </select>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setShowPurgeModal(false)}
                disabled={isPurging}
                id="cancel-purge-jobs"
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePurgeJobs}
                disabled={isPurging}
                style={{
                  backgroundColor: 'var(--color-danger, #ef4444)',
                  borderColor: 'var(--color-danger, #ef4444)',
                  color: '#ffffff',
                }}
                id="confirm-purge-jobs"
              >
                {isPurging ? "⏳ Purging…" : "🗑️ Purge Jobs"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
