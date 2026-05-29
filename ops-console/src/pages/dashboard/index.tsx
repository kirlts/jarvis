/**
 * Dashboard — Página de inicio tras login.
 *
 * Features A.1–A.6 del inventario de funcionalidades.
 * Consulta métricas agregadas desde GET /admin/dashboard/summary.
 */
import { useCustom } from '@refinedev/core';
import { useNavigate } from 'react-router';

interface DashboardSummary {
  tenants: { active: string; suspended: string; trial: string; deleted: string };
  jobs: Record<string, number>;
  whatsapp: Record<string, number>;
  storage: { files: number; bytes: string };
  inbox: { pending: number; processing: number; done: number; failed: number };
}

interface LogEntry {
  timestamp: string;
  line: string;
  labels: Record<string, string>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function SkeletonCards() {
  return (
    <div className="dashboard-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  const { query: dashQuery, result } = useCustom<DashboardSummary>({
    url: '',
    method: 'get',
    meta: { rawUrl: '/admin/dashboard/summary' },
    queryOptions: {
      queryKey: ['dashboard-summary'],
    },
  });

  const { result: logsResult } = useCustom<LogEntry[]>({
    url: '',
    method: 'get',
    meta: { rawUrl: '/admin/logs' },
    config: {
      query: {
        query: '{job="jarvis"} |= "error"',
        limit: '5',
      },
    },
    queryOptions: {
      queryKey: ['dashboard-recent-errors'],
      refetchInterval: 30000,
    },
  });

  const recentErrors = logsResult?.data || [];
  const hasErrors = recentErrors.length > 0;

  const isLoading = dashQuery?.isLoading;
  const isError = dashQuery?.isError;
  const error = dashQuery?.error;

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Resumen del sistema</p>
          </div>
        </div>
        <SkeletonCards />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
          </div>
        </div>
        <div className="error-banner">
          {(error as unknown as Error)?.message || 'Error al cargar datos del dashboard'}
        </div>
      </div>
    );
  }

  const summary = result?.data as DashboardSummary | undefined;
  if (!summary) return null;

  const tenantTotal = Number(summary.tenants.active) + Number(summary.tenants.suspended) + Number(summary.tenants.trial);
  const jobsFailed = summary.jobs.failed || 0;
  const jobsActive = summary.jobs.active || summary.jobs.created || 0;
  const jobsCompleted = summary.jobs.completed || 0;
  const waConnected = summary.whatsapp.connected || 0;
  const waDisconnected = summary.whatsapp.disconnected || 0;
  const waQrPending = summary.whatsapp.qr_pending || 0;
  const storageBytes = Number(summary.storage.bytes);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen del sistema — últimas 24 horas</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* A.1 — Usuarios (tenants) */}
        <div
          className="dashboard-card"
          onClick={() => navigate('/usuarios')}
          role="button"
          tabIndex={0}
          id="dashboard-card-tenants"
        >
          <div className="dashboard-card-label">Usuarios</div>
          <div className="dashboard-card-value">{tenantTotal}</div>
          <div className="dashboard-card-row">
            <span className="dashboard-dot dashboard-dot-success" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {summary.tenants.active} activos
            </span>
          </div>
          {Number(summary.tenants.suspended) > 0 && (
            <div className="dashboard-card-row">
              <span className="dashboard-dot dashboard-dot-warning" />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {summary.tenants.suspended} suspendidos
              </span>
            </div>
          )}
        </div>

        {/* A.2 — Cola de jobs */}
        <div
          className="dashboard-card"
          onClick={() => navigate('/operaciones')}
          role="button"
          tabIndex={0}
          id="dashboard-card-jobs"
        >
          <div className="dashboard-card-label">Cola de Jobs (24h)</div>
          <div className="dashboard-card-value" style={jobsFailed > 0 ? { color: 'var(--danger)' } : undefined}>
            {jobsFailed > 0 ? `${jobsFailed} fallidos` : `${jobsCompleted + jobsActive} total`}
          </div>
          <div className="dashboard-card-row">
            <span className="dashboard-dot dashboard-dot-info" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {jobsActive} activos
            </span>
          </div>
          <div className="dashboard-card-row">
            <span className="dashboard-dot dashboard-dot-success" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {jobsCompleted} completados
            </span>
          </div>
        </div>

        {/* A.3 — Estado WhatsApp */}
        <div
          className="dashboard-card"
          onClick={() => navigate('/usuarios')}
          role="button"
          tabIndex={0}
          id="dashboard-card-whatsapp"
        >
          <div className="dashboard-card-label">WhatsApp</div>
          <div className="metric-pills">
            <span className="badge badge-success">{waConnected} Conectados</span>
            {waQrPending > 0 && <span className="badge badge-warning">{waQrPending} QR Pendiente</span>}
            {waDisconnected > 0 && <span className="badge badge-danger">{waDisconnected} Desconectados</span>}
          </div>
        </div>

        {/* A.5 — Storage */}
        <div className="dashboard-card" id="dashboard-card-storage">
          <div className="dashboard-card-label">Storage</div>
          <div className="dashboard-card-value">{summary.storage.files}</div>
          <div className="dashboard-card-sub">
            archivos · {formatBytes(storageBytes)}
          </div>
        </div>

        {/* A.6 — Bandeja de entrada pendiente */}
        <div
          className="dashboard-card"
          id="dashboard-card-inbox"
          style={
            summary.inbox.pending > 1000
              ? { borderColor: 'var(--danger)' }
              : summary.inbox.pending > 100
                ? { borderColor: 'var(--warning)' }
                : undefined
          }
        >
          <div className="dashboard-card-label">Bandeja Pendiente</div>
          <div
            className="dashboard-card-value"
            style={
              summary.inbox.pending > 1000
                ? { color: 'var(--danger)' }
                : summary.inbox.pending > 100
                  ? { color: 'var(--warning)' }
                  : undefined
            }
          >
            {summary.inbox.pending}
          </div>
          <div className="dashboard-card-sub">elementos pendientes</div>
          <div className="dashboard-card-row">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {summary.inbox.processing} procesando · {summary.inbox.done} listos · {summary.inbox.failed} fallidos
            </span>
          </div>
        </div>

        {/* A.7 — Errores recientes */}
        <div
          className="dashboard-card"
          id="dashboard-card-errors"
          onClick={() => navigate('/operaciones')}
          role="button"
          tabIndex={0}
          style={hasErrors ? { borderColor: 'var(--danger)' } : undefined}
        >
          <div className="dashboard-card-label">Errores Recientes</div>
          {hasErrors ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
              {recentErrors.map((err: LogEntry, idx: number) => (
                <div key={idx} className="dashboard-card-row" style={{ alignItems: 'flex-start' }}>
                  <span className="dashboard-dot dashboard-dot-danger" style={{ marginTop: '4px' }} />
                  <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={err.line}>
                    {err.line}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
                <span className="dashboard-dot dashboard-dot-success" />
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  Sin errores recientes
                </span>
              </div>
              <div className="dashboard-card-sub" style={{ marginTop: 'var(--sp-2)' }}>
                Sistema operativo
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
