import { useState } from "react";
import { useCustomMutation, useCustom } from "@refinedev/core";
import { API_URL } from "../providers/constants";
import { useToast } from "./toast";

interface PluginField {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  options?: string[];
  description?: string;
  default?: unknown;
}

interface PluginManifest {
  id: string;
  name: string;
  description: string;
  fields: PluginField[];
}

// Temporary in-memory registry.
// In Phase 2, this could be fetched via API or read from a dynamic registry.
const PLUGINS_REGISTRY: PluginManifest[] = [
  {
    id: "antigravity",
    name: "Antigravity CLI",
    description: "Procesa mensajes localmente usando herramientas CLI",
    fields: [
      {
        name: "target_project",
        label: "Proyecto Objetivo",
        type: "string",
        description: "Ruta absoluta al repositorio local",
        default: "/home/kirlts/jarvis"
      },
      {
        name: "timeout_sec",
        label: "Timeout (segundos)",
        type: "number",
        default: undefined
      }
    ]
  },
  {
    id: "whisper",
    name: "Whisper STT",
    description: "Transcribe audios usando IA",
    fields: [
      {
        name: "language",
        label: "Idioma",
        type: "select",
        options: ["es", "en", "auto"],
        default: "es"
      }
    ]
  }
];

interface Props {
  channel: any;
  onRefresh: () => void;
}

export function PluginConfigForm({ channel, onRefresh }: Props) {
  const { addToast } = useToast();
  const { mutate: customMutate } = useCustomMutation();
  
  const currentConfig = channel.config || {};
  const [selectedPluginId, setSelectedPluginId] = useState<string>((currentConfig.processor as string) || "");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({ ...currentConfig });
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(JSON.stringify(currentConfig, null, 2));
  const [jsonError, setJsonError] = useState("");
  
  const [apiKeyMode, setApiKeyMode] = useState<"env" | "custom">(
    currentConfig.gemini_api_key ? "custom" : "env"
  );

  const { result } = useCustom<{ key: string; name: string }[]>({
    url: `${API_URL}/admin/whatsapp/status/gemini-keys`,
    method: "get",
  });
  
  const envKeys = (result?.data ?? []) as { key: string; name: string }[];

  const activePlugin = PLUGINS_REGISTRY.find(p => p.id === selectedPluginId);

  // When plugin changes, seed default values if the field isn't already set
  const handlePluginChange = (pluginId: string) => {
    setSelectedPluginId(pluginId);
    const newPlugin = PLUGINS_REGISTRY.find(p => p.id === pluginId);
    const newValues: Record<string, unknown> = { ...formValues, processor: pluginId };
    
    if (newPlugin) {
      newPlugin.fields.forEach(field => {
        if (newValues[field.name] === undefined && field.default !== undefined) {
          newValues[field.name] = field.default;
        }
      });
    }

    if (pluginId === "antigravity") {
      if (!newValues.gemini_api_key && !newValues.gemini_api_key_env_var) {
        newValues.gemini_api_key_env_var = "GEMINI_API_KEY";
      }
    }

    setFormValues(newValues);
    setJsonDraft(JSON.stringify(newValues, null, 2));
  };

  const handleFieldChange = (name: string, value: unknown) => {
    const newValues = { ...formValues, [name]: value };
    // Remove field if value is undefined or empty string to keep config clean
    if (value === undefined || value === "") {
      delete newValues[name];
    }
    setFormValues(newValues);
    setJsonDraft(JSON.stringify(newValues, null, 2));
  };

  const saveConfig = (payload: Record<string, unknown>) => {
    const cleaned: Record<string, unknown> = { ...payload };
    
    // Clean up undefined, empty strings, and false values that are not used
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === undefined || cleaned[key] === "") {
        delete cleaned[key];
      }
    });

    customMutate({
      url: `${API_URL}/admin/whatsapp/status/${channel.tenant_id}/channels/${channel.id}`,
      method: "patch",
      values: { config: cleaned },
    }, {
      onSuccess: () => { 
        addToast("Configuración guardada", "success"); 
        onRefresh(); 
      },
      onError: (err) => addToast(`Error: ${err.message}`, "error"),
    });
  };

  const handleVisualSubmit = () => {
    saveConfig(formValues);
  };

  const handleJsonSubmit = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      setJsonError("");
      setFormValues(parsed);
      setSelectedPluginId(parsed.processor || "");
      if (parsed.gemini_api_key) {
        setApiKeyMode("custom");
      } else {
        setApiKeyMode("env");
      }
      saveConfig(parsed);
    } catch {
      setJsonError("JSON inválido");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {/* Visual Form */}
      {!isAdvanced && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', animation: 'fadeSlideIn 0.2s ease-out' }}>
          
          <div>
            <label className="form-label" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Procesador (Plugin)</label>
            <select 
              className="form-input" 
              value={selectedPluginId} 
              onChange={(e) => handlePluginChange(e.target.value)}
              style={{ padding: 'var(--sp-2)' }}
            >
              <option value="">(Ninguno / Custom)</option>
              {PLUGINS_REGISTRY.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {activePlugin && (
              <p style={{ margin: 'var(--sp-1) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                {activePlugin.description}
              </p>
            )}
          </div>

          {selectedPluginId === "antigravity" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', paddingLeft: 'var(--sp-2)', borderLeft: '2px solid var(--primary-accent, #5d5fef)' }}>
              <div>
                <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>Proyecto Objetivo</label>
                <input 
                  type="text"
                  className="form-input cell-mono" 
                  style={{ padding: 'var(--sp-1)' }}
                  placeholder="/home/kirlts/jarvis"
                  value={String(formValues.target_project ?? '')}
                  onChange={(e) => handleFieldChange("target_project", e.target.value)}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block' }}>Ruta absoluta al repositorio local</span>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>Timeout del Subproceso (segundos)</label>
                <input 
                  type="number"
                  className="form-input" 
                  style={{ padding: 'var(--sp-1)' }}
                  placeholder="Por defecto: 120"
                  value={formValues.timeout_sec !== undefined ? String(formValues.timeout_sec) : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleFieldChange("timeout_sec", val ? parseInt(val, 10) : undefined);
                  }}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block' }}>Opcional. Deja vacío para usar el valor predeterminado del sistema (120s).</span>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>Origen de Clave API de Gemini</label>
                <select 
                  className="form-input" 
                  value={apiKeyMode} 
                  onChange={(e) => {
                    const mode = e.target.value as "env" | "custom";
                    setApiKeyMode(mode);
                    if (mode === "env") {
                      const defaultEnvVar = envKeys[0]?.key || "GEMINI_API_KEY";
                      const newValues: Record<string, any> = { 
                        ...formValues, 
                        gemini_api_key_env_var: defaultEnvVar 
                      };
                      delete newValues.gemini_api_key;
                      setFormValues(newValues);
                      setJsonDraft(JSON.stringify(newValues, null, 2));
                    } else {
                      const newValues: Record<string, any> = { ...formValues };
                      delete newValues.gemini_api_key_env_var;
                      setFormValues(newValues);
                      setJsonDraft(JSON.stringify(newValues, null, 2));
                    }
                  }}
                  style={{ padding: 'var(--sp-1)', marginBottom: 'var(--sp-2)' }}
                >
                  <option value="env">Variable de Entorno (Seleccionar de las disponibles)</option>
                  <option value="custom">Clave Personalizada (Especificada por canal)</option>
                </select>

                {apiKeyMode === "env" ? (
                  <div style={{ marginTop: 'var(--sp-1)' }}>
                    <label className="form-label" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Seleccionar Variable de Entorno</label>
                    <select
                      className="form-input"
                      value={String(formValues.gemini_api_key_env_var || "GEMINI_API_KEY")}
                      onChange={(e) => handleFieldChange("gemini_api_key_env_var", e.target.value)}
                      style={{ padding: 'var(--sp-1)', marginBottom: 'var(--sp-2)' }}
                    >
                      {envKeys.map((k: { key: string; name: string }) => (
                        <option key={k.key} value={k.key}>{k.name}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: "10px", color: "var(--success)", display: "block", background: "rgba(46, 204, 113, 0.1)", padding: "6px", borderRadius: "var(--radius-sm)" }}>
                      🟢 Se usará el valor cargado en la variable `{String(formValues.gemini_api_key_env_var || "GEMINI_API_KEY")}` en el servidor.
                    </span>
                  </div>
                ) : (
                  <div style={{ marginTop: 'var(--sp-1)' }}>
                    <input 
                      type="password" 
                      className="form-input cell-mono" 
                      placeholder="AIzaSy..." 
                      value={String(formValues.gemini_api_key || '')} 
                      onChange={(e) => handleFieldChange("gemini_api_key", e.target.value)} 
                      style={{ width: "100%", fontSize: "var(--text-xs)", padding: 'var(--sp-1)' }} 
                    />
                    <span style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px", display: "block" }}>Esta clave tendrá precedencia y se guardará de forma aislada para este canal.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activePlugin && selectedPluginId !== "antigravity" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', paddingLeft: 'var(--sp-2)', borderLeft: '2px solid var(--border-subtle)' }}>
              {activePlugin.fields.map(field => (
                <div key={field.name}>
                  <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>{field.label}</label>
                  {field.type === 'select' ? (
                    <select 
                      className="form-input" 
                      style={{ padding: 'var(--sp-1)' }}
                      value={String(formValues[field.name] || '')}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    >
                      {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : field.type === 'boolean' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--text-sm)' }}>
                      <input 
                        type="checkbox" 
                        checked={!!formValues[field.name]}
                        onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                      />
                      Activar
                    </label>
                  ) : (
                    <input 
                      type={field.type === 'number' ? 'number' : 'text'}
                      className="form-input" 
                      style={{ padding: 'var(--sp-1)' }}
                      value={String(formValues[field.name] ?? '')}
                      onChange={(e) => handleFieldChange(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                    />
                  )}
                  {field.description && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block' }}>{field.description}</span>}
                </div>
              ))}
            </div>
          )}

          {!activePlugin && selectedPluginId === "" && Object.keys(formValues).length > 0 && (
             <p style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', margin: 0 }}>
               Existen campos de configuración custom que no corresponden a un plugin conocido. Usa el modo avanzado para editarlos.
             </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--sp-2)' }}>
            <button className="btn btn-primary btn-sm" onClick={handleVisualSubmit}>Guardar Cambios</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setIsAdvanced(true)} style={{ fontSize: 'var(--text-xs)' }}>JSON Avanzado 🛠️</button>
          </div>
        </div>
      )}

      {/* Advanced JSON Fallback */}
      {isAdvanced && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', animation: 'fadeSlideIn 0.2s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Edición cruda del JSONB</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setJsonDraft(JSON.stringify(formValues, null, 2)); setIsAdvanced(false); }} style={{ fontSize: 'var(--text-xs)' }}>Volver a UI Visual 👁️</button>
          </div>
          <textarea 
            className="form-input cell-mono" 
            rows={8} 
            value={jsonDraft} 
            onChange={(e) => setJsonDraft(e.target.value)} 
            style={{ resize: "vertical", fontSize: "var(--text-xs)" }} 
          />
          {jsonError && <span style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{jsonError}</span>}
          <div>
            <button className="btn btn-primary btn-sm" onClick={handleJsonSubmit}>Guardar JSON</button>
          </div>
        </div>
      )}
    </div>
  );
}
