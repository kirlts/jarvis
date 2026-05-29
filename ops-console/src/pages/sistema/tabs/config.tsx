/**
 * Tab de Configuración dentro de Sistema.
 * Migrado desde pages/config/list.tsx — texto en español.
 */
import { useCustom } from "@refinedev/core";
import { useState } from "react";
import { useToast } from "../../../components/toast";
import { API_URL } from "../../../providers/constants";
import { getAuthHeader } from "../../../providers/auth";

interface ConfigEntry {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
  updated_by: string;
}

const CONFIG_LABELS: Record<string, string> = {
  maintenance_mode: "Modo mantenimiento",
  rate_limits: "Límites de tasa",
  retention: "Retención de datos",
  features: "Feature flags",
};

const CONFIG_DESCRIPTIONS: Record<string, string> = {
  maintenance_mode: "Bloquea tráfico no-admin y muestra un mensaje personalizado.",
  rate_limits: "Límites globales y por tenant de requests por minuto.",
  retention: "Políticas de retención para logs de auditoría, huérfanos de storage y historial de jobs (días).",
  features: "Toggles para integración WhatsApp y pipeline de sincronización.",
};

export function ConfigTab() {
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
      addToast(`Configuración "${CONFIG_LABELS[editingKey] || editingKey}" guardada`, "success");
      setEditingKey(null);
      query?.refetch?.();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setJsonError("JSON inválido");
      } else {
        addToast(`Error al guardar: ${(err as Error).message}`, "error");
      }
    }
  }

  if (isLoading) {
    return (
      <div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-line" style={{ margin: 'var(--sp-3) 0', height: '60px' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      {configs.map((entry) => (
        <div key={entry.key} className="data-table-wrapper" style={{ padding: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-3)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 'var(--sp-1)' }}>
                {CONFIG_LABELS[entry.key] || entry.key}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {CONFIG_DESCRIPTIONS[entry.key] || entry.key}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                por {entry.updated_by} · {new Date(entry.updated_at).toLocaleDateString("es-CL")}
              </span>
              {editingKey !== entry.key && (
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(entry)}>Editar</button>
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
                <button className="btn btn-primary btn-sm" onClick={saveConfig}>Guardar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingKey(null)}>Cancelar</button>
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
  );
}
