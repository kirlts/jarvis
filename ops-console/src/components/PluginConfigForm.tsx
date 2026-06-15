import { useState, useEffect } from "react";
import { useCustomMutation } from "@refinedev/core";
import { API_URL } from "../providers/constants";
import { useToast } from "./toast";
import { JsonEditor } from "./JsonEditor";

interface Props {
  channel: any;
  onRefresh?: () => void;
}

export function PluginConfigForm({ channel }: Props) {
  const { addToast } = useToast();
  const { mutate: customMutate } = useCustomMutation();

  const currentConfig = channel.config || {};
  const cleanedConfig = { ...currentConfig };
  delete cleanedConfig.processor;
  
  const [jsonDraft, setJsonDraft] = useState(JSON.stringify(cleanedConfig, null, 2));
  const [jsonError, setJsonError] = useState("");
  
  // Baileys specific state
  const isBaileys = (!channel.plugin_id || channel.plugin_id === 'whatsapp_baileys' || cleanedConfig.channel_type === 'whatsapp_baileys');
  const [baileysConfig, setBaileysConfig] = useState({
    markOnlineOnConnect: cleanedConfig.markOnlineOnConnect ?? true,
    readReceipts: cleanedConfig.readReceipts ?? true,
    syncHistory: cleanedConfig.syncHistory ?? false,
    typingIndicator: cleanedConfig.typingIndicator ?? true,
    delayMs: cleanedConfig.delayMs ?? 1000,
  });

  useEffect(() => {
    setJsonDraft(JSON.stringify(cleanedConfig, null, 2));
  }, [channel]);

  const handleJsonBlur = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      saveConfig(parsed);
    } catch (e) {
      setJsonError("JSON inválido: " + (e instanceof Error ? e.message : ""));
    }
  };

  const updateBaileysConfig = (updates: Partial<typeof baileysConfig>) => {
    const newConfig = { ...baileysConfig, ...updates };
    setBaileysConfig(newConfig);
    const updated = { ...cleanedConfig, ...newConfig };
    saveConfig(updated);
  };

  const saveConfig = (parsed: any) => {
    setJsonError("");
    delete parsed.processor;
    
    // Auto-clean redundant fields if present
    if (parsed.channel_type) {
      delete parsed.channel_type; 
    }

    customMutate({
      url: `${API_URL}/admin/whatsapp/status/${channel.tenant_id}/channels/${channel.id}`,
      method: "patch",
      values: { config: parsed },
    }, {
      onSuccess: () => { 
        addToast("Configuración guardada automáticamente", "success"); 
        // No llamamos a onRefresh() para evitar que el componente se desmonte
      },
      onError: (err) => addToast(`Error: ${err.message}`, "error"),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {isBaileys && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={baileysConfig.markOnlineOnConnect} 
                onChange={e => updateBaileysConfig({ markOnlineOnConnect: e.target.checked })} 
              />
              Mantener estado "En línea"
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={baileysConfig.readReceipts} 
                onChange={e => updateBaileysConfig({ readReceipts: e.target.checked })} 
              />
              Enviar confirmaciones de lectura (Check azul)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={baileysConfig.typingIndicator} 
                onChange={e => updateBaileysConfig({ typingIndicator: e.target.checked })} 
              />
              Mostrar "escribiendo..." antes de responder
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={baileysConfig.syncHistory} 
                onChange={e => updateBaileysConfig({ syncHistory: e.target.checked })} 
              />
              Sincronizar historial de mensajes antiguos
            </label>
          </div>
          <div>
            <label className="form-label" style={{ fontSize: 'var(--text-sm)' }}>Retraso artificial al responder (ms)</label>
            <input 
              type="number" 
              className="form-input" 
              value={baileysConfig.delayMs} 
              onChange={e => setBaileysConfig({...baileysConfig, delayMs: parseInt(e.target.value) || 0})}
              onBlur={() => updateBaileysConfig({ delayMs: baileysConfig.delayMs })}
              min="0"
              step="100"
              style={{ width: '150px' }}
            />
            <p style={{ margin: '4px 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Útil para simular un humano escribiendo. (Ej. 1000 = 1 segundo).
            </p>
          </div>
        </div>
      )}

      {/* JSON Editor inside a native details tag */}
      <JsonEditor
        value={jsonDraft}
        onChange={setJsonDraft}
        onBlur={handleJsonBlur}
        error={jsonError}
      />
    </div>
  );
}
