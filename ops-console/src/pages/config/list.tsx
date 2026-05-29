/**
 * System Config Page — F.1, F.2
 *
 * Features:
 * - List all config keys with their JSON values
 * - Inline JSON editing per key
 * - Toast on save
 * - Audit logging on backend
 */
import { useCustom } from "@refinedev/core";
import { useState } from "react";
import { useToast } from "../../components/toast";
import { API_URL } from "../../providers/constants";
import { getAuthHeader } from "../../providers/auth";

interface ConfigEntry {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
  updated_by: string;
}

export function SystemConfigPage() {
  const { addToast } = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [jsonError, setJsonError] = useState("");

  const { query, result } = useCustom<ConfigEntry[]>({
    url: '', method: 'get',
    meta: { rawUrl: '/admin/config' },
    queryOptions: { queryKey: ['system-config'] },
  });

  const configs = (result?.data ?? []) as ConfigEntry[];
  const isLoading = query?.isLoading;

  function startEdit(entry: ConfigEntry) {
    setEditingKey(entry.key);
    setEditValue(JSON.stringify(entry.value, null, 2));
    setJsonError("");
  }

  async function saveConfig() {
    if (!editingKey) return;
    try {
      const parsed = JSON.parse(editValue);
      setJsonError("");

      const resp = await fetch(`${API_URL}/admin/config/${editingKey}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ value: parsed }),
      });

      if (!resp.ok) throw new Error(await resp.text());
      addToast(`Config "${editingKey}" saved`, "success");
      setEditingKey(null);
      query?.refetch?.();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setJsonError("Invalid JSON");
      } else {
        addToast(`Save failed: ${(err as Error).message}`, "error");
      }
    }
  }

  const CONFIG_LABELS: Record<string, string> = {
    maintenance_mode: "Maintenance Mode",
    rate_limits: "Rate Limits",
    retention: "Data Retention",
    features: "Feature Flags",
  };

  const CONFIG_DESCRIPTIONS: Record<string, string> = {
    maintenance_mode: "Enable maintenance mode to block non-admin traffic and display a custom message.",
    rate_limits: "Global and per-tenant request rate limits (requests per minute).",
    retention: "Retention policies for audit logs, storage orphans, and job history (days).",
    features: "Feature toggle switches for WhatsApp integration and sync pipeline.",
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Configuration</h1>
          <p className="page-subtitle">Runtime settings</p>
        </div>
      </div>

      {isLoading ? (
        <div className="data-table-wrapper">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-card" style={{ marginBottom: 'var(--sp-4)' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          {configs.map((entry) => (
            <div key={entry.key} className="dashboard-card" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-3)' }}>
                <div>
                  <div className="dashboard-card-label" style={{ marginBottom: 'var(--sp-1)' }}>
                    {CONFIG_LABELS[entry.key] || entry.key}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {CONFIG_DESCRIPTIONS[entry.key] || entry.key}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                    by {entry.updated_by} · {new Date(entry.updated_at).toLocaleDateString()}
                  </span>
                  {editingKey !== entry.key && (
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(entry)}>Edit</button>
                  )}
                </div>
              </div>

              {editingKey === entry.key ? (
                <div>
                  <textarea
                    className="form-input"
                    value={editValue}
                    onChange={(e) => { setEditValue(e.target.value); setJsonError(""); }}
                    rows={6}
                    spellCheck={false}
                    style={{
                      width: '100%',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                    }}
                    id={`config-editor-${entry.key}`}
                  />
                  {jsonError && <div className="error-banner" style={{ marginTop: 'var(--sp-2)' }}>{jsonError}</div>}
                  <div style={{ marginTop: 'var(--sp-3)', display: 'flex', gap: 'var(--sp-2)' }}>
                    <button className="btn btn-primary btn-sm" onClick={saveConfig}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingKey(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <pre style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--sp-3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  margin: 0,
                  overflow: 'auto',
                }}>
                  {JSON.stringify(entry.value, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
