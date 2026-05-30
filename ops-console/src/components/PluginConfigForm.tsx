import { useState } from "react";
import { useCustomMutation } from "@refinedev/core";
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
        default: 120
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
    setFormValues(newValues);
    setJsonDraft(JSON.stringify(newValues, null, 2));
  };

  const handleFieldChange = (name: string, value: unknown) => {
    const newValues = { ...formValues, [name]: value };
    setFormValues(newValues);
    setJsonDraft(JSON.stringify(newValues, null, 2));
  };

  const saveConfig = (payload: Record<string, unknown>) => {
    customMutate({
      url: `${API_URL}/admin/whatsapp/status/${channel.tenant_id}/channels/${channel.id}`,
      method: "patch",
      values: { config: payload },
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

          {activePlugin && (
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
