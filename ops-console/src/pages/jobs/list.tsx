import { useList } from "@refinedev/core";
import { useState } from "react";

interface Job {
  id: string;
  name: string;
  state: string;
  data: Record<string, unknown>;
  created_on: string;
  started_on: string | null;
  completed_on: string | null;
}

const STATE_BADGE: Record<string, string> = {
  active: "badge-info",
  completed: "badge-success",
  failed: "badge-danger",
  expired: "badge-warning",
  cancelled: "badge-neutral",
  retry: "badge-warning",
};

export function JobListPage() {
  const [stateFilter, setStateFilter] = useState("");

  const { query, result } = useList<Job>({
    resource: "jobs",
    pagination: { pageSize: 50 },
    filters: stateFilter
      ? [{ field: "state", operator: "eq" as const, value: stateFilter }]
      : [],
  });

  const jobs = result.data ?? [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Job Queues</h1>
          <p className="page-subtitle">pg-boss job monitoring</p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          {["", "active", "completed", "failed"].map((state) => (
            <button
              key={state}
              className={`btn btn-sm ${stateFilter === state ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStateFilter(state)}
            >
              {state || "All"}
            </button>
          ))}
        </div>
      </div>

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Failed to load jobs"}
        </div>
      )}

      {query.isLoading ? (
        <div className="loading">
          <div className="loading-spinner" />
          Loading jobs…
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
                <th>ID</th>
                <th>Name</th>
                <th>State</th>
                <th>Created</th>
                <th>Started</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: Job) => (
                <tr key={job.id}>
                  <td className="cell-mono">{job.id.slice(0, 8)}…</td>
                  <td>{job.name}</td>
                  <td>
                    <span
                      className={`badge ${STATE_BADGE[job.state] || "badge-neutral"}`}
                    >
                      {job.state}
                    </span>
                  </td>
                  <td className="cell-mono">
                    {new Date(job.created_on).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="cell-mono">
                    {job.started_on
                      ? new Date(job.started_on).toLocaleString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="cell-mono">
                    {job.completed_on
                      ? new Date(job.completed_on).toLocaleString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
