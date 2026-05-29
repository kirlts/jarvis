/**
 * Tab de Logs dentro de Operaciones.
 * Migrado desde pages/logs/list.tsx — texto en español.
 */
import { useCustom } from "@refinedev/core";
import { useState, useEffect } from "react";

interface LogEntry {
  timestamp: string;
  line: string;
  labels: Record<string, string>;
}

function formatNanoTimestamp(ns: string): string {
  const ms = Number(ns) / 1_000_000;
  return new Date(ms).toLocaleTimeString("es-CL", { hour12: false,
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function LogsTab() {
  const [lokiQuery, setLokiQuery] = useState('{job="jarvis"}');
  const [limit, setLimit] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { query, result } = useCustom<{ data: LogEntry[]; meta: { total: number } }>({
    url: '', method: 'get',
    meta: { rawUrl: `/admin/logs?query=${encodeURIComponent(lokiQuery)}&limit=${limit}` },
    queryOptions: {
      queryKey: ['loki-logs', lokiQuery, limit, refreshKey],
      retry: false,
    },
  });

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => setRefreshKey(k => k + 1), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const entries = (result?.data as unknown as { data: LogEntry[] })?.data ?? [];
  const isLoading = query?.isLoading;
  const isError = query?.isError;
  const error = query?.error;

  return (
    <div>
      {/* Controles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flex: 1 }}>
          <input
            className="form-input"
            type="text"
            value={lokiQuery}
            onChange={(e) => setLokiQuery(e.target.value)}
            placeholder='{job="jarvis"}'
            style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
            id="loki-query-input"
          />
          <select
            className="form-input"
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            id="logs-limit"
          >
            <option value="50">50 líneas</option>
            <option value="100">100 líneas</option>
            <option value="200">200 líneas</option>
            <option value="500">500 líneas</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', marginLeft: 'var(--sp-3)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto (5s)
          </label>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRefreshKey(k => k + 1)}
            id="logs-refresh"
          >
            ↻ Refrescar
          </button>
        </div>
      </div>

      {isError && (
        <div className="error-banner">
          {(error as unknown as Error)?.message || "No se pudo conectar con Loki"}
        </div>
      )}

      {isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-2) var(--sp-4)' }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">Sin entradas de log para esta consulta</p>
        </div>
      ) : (
        <div style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--sp-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          maxHeight: '600px',
          overflow: 'auto',
        }}>
          {entries.map((entry, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: 'var(--sp-3)',
                padding: 'var(--sp-1) 0',
                borderBottom: '1px solid var(--border-subtle)',
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {formatNanoTimestamp(entry.timestamp)}
              </span>
              {entry.labels.level && (
                <span style={{
                  color: entry.labels.level === 'error' ? 'var(--danger)'
                    : entry.labels.level === 'warn' ? 'var(--warning)'
                    : 'var(--text-tertiary)',
                  width: '40px',
                  flexShrink: 0,
                  textTransform: 'uppercase',
                }}>
                  {entry.labels.level.substring(0, 4)}
                </span>
              )}
              <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                {entry.line}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
