/**
 * ChannelDetailDrawer — Slide-out panel for a single WhatsApp channel.
 * Shows QR code (reactive via SSE), session metadata, config editor,
 * and lifecycle actions (reconnect, disconnect, delete).
 *
 * All mutations use useCustomMutation with meta.rawUrl per docs/RULES.md.
 */
import { useCustomMutation } from "@refinedev/core";
import { useState } from "react";
import { API_URL } from "../providers/constants";
import { getAuthHeader } from "../providers/auth";
import { useToast } from "./toast";

interface Channel {
  id: string;
  tenant_id: string;
  name: string;
  phone_number: string | null;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  session_id: string | null;
  session_status: string | null;
  qr_code: string | null;
  qr_generated_at: string | null;
  qr_scanned_at: string | null;
  qr_scanned_by: string | null;
  session_updated_at: string | null;
}

interface Props {
  channel: Channel;
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_DOT: Record<string, string> = {
  connected: "dashboard-dot-success",
  disconnected: "dashboard-dot-danger",
  connecting: "dashboard-dot-warning",
  qr_pending: "dashboard-dot-info",
  qr_expired: "dashboard-dot-warning",
  waiting_qr: "dashboard-dot-info",
};

const STATUS_BADGE: Record<string, string> = {
  connected: "badge-success",
  disconnected: "badge-danger",
  connecting: "badge-warning",
  qr_pending: "badge-info",
  qr_expired: "badge-warning",
  waiting_qr: "badge-info",
};

export function ChannelDetailDrawer({ channel, onClose, onRefresh }: Props) {
  const { addToast } = useToast();
  const { mutate: customMutate } = useCustomMutation();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(channel.name);
  const [editingConfig, setEditingConfig] = useState(false);
  
  // Form states for intuitive plugin configuration
  const [processor, setProcessor] = useState<string>("stub");
  const [apiKeyMode, setApiKeyMode] = useState<"env" | "custom">("env");
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [timeoutSec, setTimeoutSec] = useState<string>("");
  const [targetProject, setTargetProject] = useState<string>("");

  const effectiveStatus = channel.session_status || channel.status;
  const canReconnect = ["disconnected", "qr_expired", "qr_pending", "waiting_qr", "connected"].includes(effectiveStatus);

  const handleReconnect = () => {
    customMutate({
      url: `${API_URL}/admin/whatsapp/status/${channel.tenant_id}/channels/${channel.id}/reconnect`,
      method: "post",
      values: {},
    }, {
      onSuccess: () => { addToast("Reconexión encolada", "success"); onRefresh(); },
      onError: (err) => addToast(`Error: ${err.message}`, "error"),
    });
  };

  const handleDisconnect = () => {
    if (!confirm("¿Desconectar este canal? Se eliminarán las credenciales.")) return;
    customMutate({
      url: `${API_URL}/admin/whatsapp/status/${channel.tenant_id}/channels/${channel.id}?confirm=true`,
      method: "delete",
      values: {},
    }, {
      onSuccess: () => { addToast("Canal desconectado", "success"); onClose(); onRefresh(); },
      onError: (err) => addToast(`Error: ${err.message}`, "error"),
    });
  };

  const handleSaveName = () => {
    if (!nameValue.trim()) return;
    customMutate({
      url: `${API_URL}/admin/whatsapp/status/${channel.tenant_id}/channels/${channel.id}`,
      method: "patch",
      values: { name: nameValue.trim() },
    }, {
      onSuccess: () => { addToast("Nombre actualizado", "success"); setEditingName(false); onRefresh(); },
      onError: (err) => addToast(`Error: ${err.message}`, "error"),
    });
  };

  const startEditingConfig = () => {
    const currentProcessor = (channel.config?.processor as string) || "stub";
    const currentApiKey = (channel.config?.gemini_api_key as string) || "";
    const currentTimeout = channel.config?.timeout_sec !== undefined ? String(channel.config.timeout_sec) : "";
    const currentProject = (channel.config?.target_project as string) || "/home/kirlts/jarvis";

    setProcessor(currentProcessor);
    setApiKeyMode(currentApiKey ? "custom" : "env");
    setGeminiApiKey(currentApiKey);
    setTimeoutSec(currentTimeout);
    setTargetProject(currentProject);
    setEditingConfig(true);
  };

  const handleSaveConfig = () => {
    const newConfig: Record<string, unknown> = {
      processor,
      ...(processor === "antigravity" && {
        target_project: targetProject || undefined,
        timeout_sec: timeoutSec ? parseInt(timeoutSec, 10) : undefined,
        gemini_api_key: apiKeyMode === "custom" && geminiApiKey ? geminiApiKey : undefined,
      }),
    };

    // Clean up undefined keys
    Object.keys(newConfig).forEach((key) => {
      if (newConfig[key] === undefined) {
        delete newConfig[key];
      }
    });

    customMutate({
      url: `${API_URL}/admin/whatsapp/status/${channel.tenant_id}/channels/${channel.id}`,
      method: "patch",
      values: { config: newConfig },
    }, {
      onSuccess: () => { addToast("Configuración guardada", "success"); setEditingConfig(false); onRefresh(); },
      onError: (err) => addToast(`Error: ${err.message}`, "error"),
    });
  };

  return (
    <div
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "520px",
        background: "var(--surface-0)", borderLeft: "1px solid var(--border-subtle)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.15)", zIndex: 1000,
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "slideInRight 0.2s ease-out",
      }}
    >
      {/* Header */}
      <div style={{ padding: "var(--sp-4)", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <span className={`dashboard-dot ${STATUS_DOT[effectiveStatus] || "dashboard-dot-neutral"}`} />
          {editingName ? (
            <div style={{ display: "flex", gap: "var(--sp-1)" }}>
              <input className="form-input" value={nameValue} onChange={(e) => setNameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveName()} autoFocus style={{ width: "200px" }} />
              <button className="btn btn-primary btn-sm" onClick={handleSaveName}>✓</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(false)}>✕</button>
            </div>
          ) : (
            <h2 style={{ margin: 0, fontSize: "var(--text-lg)", cursor: "pointer" }} onDoubleClick={() => setEditingName(true)} title="Doble clic para editar">
              {channel.name}
            </h2>
          )}
          <span className={`badge ${STATUS_BADGE[effectiveStatus] || "badge-neutral"}`}>
            {effectiveStatus.replace(/_/g, " ")}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: "0 8px", fontSize: "1.2rem" }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--sp-4)", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>

        {/* QR Code Section */}
        {effectiveStatus === "qr_pending" && channel.qr_code && (
          <div style={{ padding: "var(--sp-4)", borderRadius: "var(--radius-md)", background: "var(--surface-1)", border: "1px dashed var(--border-subtle)", textAlign: "center" }}>
            <div style={{ padding: "var(--sp-3)", background: "#fff", borderRadius: "8px", display: "inline-flex" }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(channel.qr_code)}`}
                alt="QR Code" style={{ width: "220px", height: "220px" }}
              />
            </div>
            <h3 style={{ margin: "var(--sp-3) 0 var(--sp-1) 0" }}>Escanea con WhatsApp</h3>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Abre WhatsApp → Dispositivos Vinculados → Escanea este código.
            </p>
          </div>
        )}

        {effectiveStatus === "waiting_qr" && (
          <div style={{ padding: "var(--sp-5)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-3)" }}>
            <div className="loading-spinner" style={{ width: "24px", height: "24px", borderWidth: "3px" }} />
            <h3 style={{ margin: 0 }}>Inicializando canal...</h3>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Generando código QR. Se actualiza automáticamente.</p>
          </div>
        )}

        {effectiveStatus === "qr_expired" && (
          <div style={{ padding: "var(--sp-4)", textAlign: "center", background: "var(--surface-1)", borderRadius: "var(--radius-md)" }}>
            <div style={{ fontSize: "2rem" }}>⏰</div>
            <h3 style={{ margin: "var(--sp-2) 0" }}>QR expirado</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Haz clic en "Regenerar QR" para generar uno nuevo.</p>
          </div>
        )}

        {/* Session Metadata */}
        <div style={{ background: "var(--surface-1)", padding: "var(--sp-3)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: "var(--sp-2)", fontSize: "var(--text-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Canal ID</span>
            <span className="cell-mono" style={{ fontSize: "var(--text-xs)" }}>{channel.id}</span>
          </div>
          {channel.phone_number && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Teléfono</span>
              <strong>{channel.phone_number}</strong>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Creado</span>
            <span className="cell-mono">{new Date(channel.created_at).toLocaleString("es-CL", { hour12: false })}</span>
          </div>
          {channel.qr_generated_at && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>QR generado</span>
              <span className="cell-mono">{new Date(channel.qr_generated_at).toLocaleString("es-CL", { hour12: false })}</span>
            </div>
          )}
          {channel.qr_scanned_at && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>QR escaneado</span>
              <span className="cell-mono">{new Date(channel.qr_scanned_at).toLocaleString("es-CL", { hour12: false })} por {channel.qr_scanned_by}</span>
            </div>
          )}
          {channel.session_updated_at && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Último heartbeat</span>
              <span className="cell-mono">{new Date(channel.session_updated_at).toLocaleString("es-CL", { hour12: false })}</span>
            </div>
          )}
        </div>

        {/* Config Editor */}
        <div style={{ background: "var(--surface-1)", padding: "var(--sp-3)", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
            <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Configuración (Plugin Binding)</span>
            {!editingConfig && (
              <button className="btn btn-ghost btn-sm" onClick={startEditingConfig}>Editar</button>
            )}
          </div>
          {editingConfig ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <div>
                <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "var(--sp-1)" }}>Procesador / Plugin</label>
                <select className="form-input" value={processor} onChange={(e) => setProcessor(e.target.value)} style={{ width: "100%", fontSize: "var(--text-xs)", background: "var(--surface-0)", color: "var(--text-primary)" }}>
                  <option value="stub">Procesador Estándar (Stubs de IA / Transductor)</option>
                  <option value="antigravity">Antigravity CLI (Local RAG + Gemini IA)</option>
                </select>
              </div>

              {processor === "antigravity" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", paddingLeft: "var(--sp-2)", borderLeft: "2px solid var(--primary-accent, #5d5fef)" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "var(--sp-1)" }}>Origen de Clave API de Gemini</label>
                    <select className="form-input" value={apiKeyMode} onChange={(e) => setApiKeyMode(e.target.value as "env" | "custom")} style={{ width: "100%", fontSize: "var(--text-xs)", background: "var(--surface-0)", color: "var(--text-primary)", marginBottom: "var(--sp-2)" }}>
                      <option value="env">Variable de Entorno (process.env.GEMINI_API_KEY)</option>
                      <option value="custom">Clave Personalizada (Especificada por canal)</option>
                    </select>
                    {apiKeyMode === "env" ? (
                      <span style={{ fontSize: "10px", color: "var(--success)", display: "block", background: "rgba(46, 204, 113, 0.1)", padding: "6px", borderRadius: "var(--radius-sm)" }}>
                        🟢 Se heredará la clave de API global del servidor de Jarvis. No necesitas ingresar una clave manualmente.
                      </span>
                    ) : (
                      <div>
                        <input type="password" className="form-input cell-mono" placeholder="AIzaSy..." value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} style={{ width: "100%", fontSize: "var(--text-xs)" }} />
                        <span style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px", display: "block" }}>Esta clave tendrá precedencia y se guardará de forma aislada para este canal.</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "var(--sp-1)" }}>Timeout del Subproceso (segundos)</label>
                    <input type="number" className="form-input" placeholder="Por defecto: 120" value={timeoutSec} onChange={(e) => setTimeoutSec(e.target.value)} style={{ width: "100%", fontSize: "var(--text-xs)" }} />
                    <span style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px", display: "block" }}>Opcional. Deja vacío para usar el valor predeterminado del sistema.</span>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "var(--sp-1)" }}>Ruta del Proyecto Local</label>
                    <input type="text" className="form-input cell-mono" placeholder="/home/kirlts/jarvis" value={targetProject} onChange={(e) => setTargetProject(e.target.value)} style={{ width: "100%", fontSize: "var(--text-xs)" }} />
                    <span style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px", display: "block" }}>Directorio raíz de ejecución para el subproceso.</span>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  El Procesador Estándar utiliza stubs locales estáticos para la transducción de archivos multimedia. No requiere parámetros adicionales.
                </p>
              )}

              <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-1)" }}>
                <button className="btn btn-primary btn-sm" onClick={handleSaveConfig}>Guardar Cambios</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingConfig(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginBottom: "var(--sp-2)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Plugin Activo:</span>
                <strong>{channel.config?.processor === "antigravity" ? "Antigravity CLI (RAG + Gemini)" : "Procesador Estándar (Stubs)"}</strong>
              </div>
              {channel.config?.processor === "antigravity" && (
                <div style={{ fontSize: "var(--text-xs)", display: "flex", flexDirection: "column", gap: "4px", padding: "8px", background: "var(--surface-0)", borderRadius: "var(--radius-sm)", marginTop: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Gemini Key:</span>
                    <span className="cell-mono">{channel.config?.gemini_api_key ? "•••••••• (Personalizada)" : "Heredada de Entorno (Global)"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Timeout:</span>
                    <span>{channel.config?.timeout_sec !== undefined ? `${String(channel.config.timeout_sec)}s` : "Por defecto (120s)"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Proyecto:</span>
                    <span className="cell-mono">{String(channel.config?.target_project ?? "/home/kirlts/jarvis")}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{ padding: "var(--sp-3)", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end" }}>
        {canReconnect && effectiveStatus !== "connected" && (
          <button className="btn btn-primary btn-sm" onClick={handleReconnect}>
            {effectiveStatus === "qr_expired" ? "Regenerar QR" : "Inicializar conexión"}
          </button>
        )}
        {effectiveStatus === "connected" && (
          <button className="btn btn-secondary btn-sm" onClick={handleReconnect}>Reconectar</button>
        )}
        {effectiveStatus !== "disconnected" && (
          <button className="btn btn-danger btn-sm" onClick={handleDisconnect}>Desconectar</button>
        )}
      </div>
    </div>
  );
}
