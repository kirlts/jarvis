/**
 * Health Monitor Page — J.1, J.2
 *
 * Features:
 * - Service health status cards with latency
 * - Overall status indicator
 * - Auto-refresh every 15 seconds
 * - Manual refresh button
 */
import { useCustom } from "@refinedev/core";
import { useEffect, useState } from "react";

interface ServiceHealth {
  status: string;
  latency_ms?: number;
  error?: string;
  active_jobs?: number;
  recent_failures?: number;
}

interface HealthResponse {
  status: string;
  services: Record<string, ServiceHealth>;
  timestamp: string;
}

const STATUS_DOT: Record<string, string> = {
  healthy: "dashboard-dot-success",
  degraded: "dashboard-dot-warning",
  unhealthy: "dashboard-dot-danger",
};

const STATUS_COLOR: Record<string, string> = {
  healthy: "var(--success)",
  degraded: "var(--warning)",
  unhealthy: "var(--danger)",
};

const SERVICE_LABELS: Record<string, string> = {
  database: "PostgreSQL",
  pooler: "PgBouncer",
  loki: "Loki (Logs)",
  storage: "MinIO (Storage)",
  job_queue: "pg-boss (Jobs)",
};

export function HealthMonitorPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { query, result } = useCustom<HealthResponse>({
    url: '', method: 'get',
    meta: { rawUrl: '/admin/health' },
    queryOptions: {
      queryKey: ['admin-health', refreshKey],
      retry: false,
    },
  });

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  const health = result?.data as HealthResponse | undefined;
  const isLoading = query?.isLoading;
  const isError = query?.isError;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Health Monitor</h1>
          <p className="page-subtitle">
            {health ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <span className={`dashboard-dot ${STATUS_DOT[health.status] || 'dashboard-dot-neutral'}`}
                  style={{ display: 'inline-block' }} />
                Overall: <strong style={{ color: STATUS_COLOR[health.status] }}>{health.status}</strong>
                <span style={{ color: 'var(--text-tertiary)', marginLeft: 'var(--sp-3)' }}>
                  {new Date(health.timestamp).toLocaleTimeString("es-CL", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
            ) : 'Loading…'}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setRefreshKey(k => k + 1)}
          id="health-refresh"
        >
          ↻ Refresh
        </button>
      </div>

      {isError && (
        <div className="error-banner">Unable to reach health endpoint</div>
      )}

      {isLoading ? (
        <div className="dashboard-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      ) : health ? (
        <div className="dashboard-grid">
          {Object.entries(health.services).map(([key, svc]) => (
            <div
              key={key}
              className="dashboard-card"
              style={{
                cursor: 'default',
                borderLeftWidth: '3px',
                borderLeftColor: STATUS_COLOR[svc.status] || 'var(--border-subtle)',
              }}
            >
              <div className="dashboard-card-row" style={{ marginTop: 0 }}>
                <span className={`dashboard-dot ${STATUS_DOT[svc.status] || 'dashboard-dot-neutral'}`} />
                <span className="dashboard-card-label" style={{ marginBottom: 0 }}>
                  {SERVICE_LABELS[key] || key}
                </span>
              </div>
              <div
                className="dashboard-card-value"
                style={{ color: STATUS_COLOR[svc.status], marginTop: 'var(--sp-2)', fontSize: 'var(--text-lg)' }}
              >
                {svc.status}
              </div>
              {svc.latency_ms !== undefined && (
                <div className="dashboard-card-sub">
                  {svc.latency_ms}ms latency
                </div>
              )}
              {svc.error && (
                <div className="dashboard-card-sub" style={{ color: 'var(--danger)' }}>
                  {svc.error}
                </div>
              )}
              {svc.active_jobs !== undefined && (
                <div className="dashboard-card-sub">
                  {svc.active_jobs} active · {svc.recent_failures} failures (1h)
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
