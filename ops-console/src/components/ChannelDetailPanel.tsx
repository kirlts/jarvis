/**
 * ChannelDetailPanel — Inline detail panel for a WhatsApp channel.
 * Replaces the old ChannelDetailDrawer (fixed overlay) with a master-detail
 * split view that lives inside the tab content flow.
 *
 * All mutations use useCustomMutation with rawUrl per docs/RULES.md.
 */
import { useState } from "react";
import { useCustomMutation } from "@refinedev/core";
import { API_URL } from "../providers/constants";
import { useToast } from "./toast";
import { PluginConfigForm } from "./PluginConfigForm";

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

export function ChannelDetailPanel({ channel, onRefresh }: Props) {
  const { addToast } = useToast();
  const { mutate: customMutate } = useCustomMutation();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(channel.name);

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
      onSuccess: () => { addToast("Canal desconectado", "success"); onRefresh(); },
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

  return (
    <div className="channel-detail-panel" style={{
      display: "flex", flexDirection: "column", gap: "var(--sp-4)",
      overflowY: "auto", animation: "fadeSlideIn 0.18s ease-out",
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        <span className={`dashboard-dot ${STATUS_DOT[effectiveStatus] || "dashboard-dot-neutral"}`} />
        {editingName ? (
          <div style={{ display: "flex", gap: "var(--sp-1)", alignItems: "center" }}>
            <input className="form-input" value={nameValue} onChange={(e) => setNameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveName()} autoFocus style={{ width: "200px" }} />
            <button className="btn btn-primary btn-sm" onClick={handleSaveName}>✓</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(false)}>✕</button>
          </div>
        ) : (
          <h3
            style={{ margin: 0, fontSize: "var(--text-lg)", cursor: "pointer", transition: "color var(--duration-fast)" }}
            onDoubleClick={() => setEditingName(true)}
            title="Doble clic para editar"
          >
            {channel.name}
          </h3>
        )}
        <span className={`badge ${STATUS_BADGE[effectiveStatus] || "badge-neutral"}`}>
          {effectiveStatus.replace(/_/g, " ")}
        </span>
      </div>

      {/* QR Code Section */}
      {effectiveStatus === "qr_pending" && channel.qr_code && (
        <div style={{ padding: "var(--sp-4)", borderRadius: "var(--radius-md)", background: "var(--surface-1)", border: "1px dashed var(--border-subtle)", textAlign: "center" }}>
          <div style={{ padding: "var(--sp-3)", background: "#fff", borderRadius: "8px", display: "inline-flex" }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(channel.qr_code)}`}
              alt="QR Code" style={{ width: "200px", height: "200px" }}
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

      {/* Plugin Config Editor */}
      <div style={{ background: "var(--surface-1)", padding: "var(--sp-3)", borderRadius: "var(--radius-md)" }}>
        <h4 style={{ fontWeight: 600, fontSize: "var(--text-sm)", margin: "0 0 var(--sp-2) 0" }}>Configuración del Canal</h4>
        <PluginConfigForm channel={channel} onRefresh={onRefresh} />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
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
