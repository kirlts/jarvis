/**
 * Tab de Estado dentro de Sistema.
 * Migrado desde pages/health/list.tsx — texto en español,
 * presentación en tabla en vez de cards.
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

const STATUS_LABELS: Record<string, string> = {
  healthy: "Saludable",
  degraded: "Degradado",
  unhealthy: "Caído",
};

export function EstadoTab() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { query, result } = useCustom<HealthResponse>({
    url: '', method: 'get',
    meta: { rawUrl: '/admin/health' },
    queryOptions: {
      queryKey: ['admin-health', refreshKey],
      retry: false,
    },
  });

  // Auto-refresh cada 15 segundos
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  const health = result?.data as HealthResponse | undefined;
  const isLoading = query?.isLoading;
  const isError = query?.isError;

  return (
    <div>
      {/* Estado global */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
        <div>
          {health && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--text-sm)' }}>
              <span className={`dashboard-dot ${STATUS_DOT[health.status] || 'dashboard-dot-neutral'}`} />
              Estado general: <strong style={{ color: STATUS_COLOR[health.status] }}>{STATUS_LABELS[health.status] || health.status}</strong>
              <span style={{ color: 'var(--text-tertiary)', marginLeft: 'var(--sp-3)', fontSize: 'var(--text-xs)' }}>
                {new Date(health.timestamp).toLocaleTimeString("es-CL", { hour12: false, hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setRefreshKey(k => k + 1)}
          id="health-refresh"
        >
          ↻ Refrescar
        </button>
      </div>

      {isError && (
        <div className="error-banner">No se pudo conectar al endpoint de estado</div>
      )}

      {isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) var(--sp-4)' }} />
          ))}
        </div>
      ) : health ? (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Estado</th>
                <th>Latencia</th>
                <th>Detalles</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(health.services).map(([key, svc]) => (
                <tr key={key}>
                  <td style={{ fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                      <span className={`dashboard-dot ${STATUS_DOT[svc.status] || 'dashboard-dot-neutral'}`} />
                      {SERVICE_LABELS[key] || key}
                    </div>
                  </td>
                  <td>
                    <span style={{ color: STATUS_COLOR[svc.status], fontWeight: 600 }}>
                      {STATUS_LABELS[svc.status] || svc.status}
                    </span>
                  </td>
                  <td className="cell-mono">
                    {svc.latency_ms !== undefined ? `${svc.latency_ms}ms` : '—'}
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {svc.error && <span style={{ color: 'var(--danger)' }}>{svc.error}</span>}
                    {svc.active_jobs !== undefined && (
                      <span>{svc.active_jobs} activos · {svc.recent_failures} fallos (1h)</span>
                    )}
                    {!svc.error && svc.active_jobs === undefined && '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
