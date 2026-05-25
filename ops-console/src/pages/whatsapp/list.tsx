import { useList } from "@refinedev/core";

interface WhatsAppConnection {
  id: string;
  tenant_id: string;
  status: string;
  updated_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  connected: "badge-success",
  disconnected: "badge-danger",
  connecting: "badge-warning",
  waiting_qr: "badge-info",
};

export function WhatsAppStatusPage() {
  const { query, result } = useList<WhatsAppConnection>({
    resource: "whatsapp",
  });

  const connections = result.data ?? [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">WhatsApp Status</h1>
          <p className="page-subtitle">Baileys connection monitoring</p>
        </div>
      </div>

      {query.isError && (
        <div className="error-banner" role="alert">
          {query.error?.message || "Failed to load WhatsApp status"}
        </div>
      )}

      {query.isLoading ? (
        <div className="loading">
          <div className="loading-spinner" />
          Loading connections…
        </div>
      ) : connections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <p className="empty-state-text">
            No WhatsApp connections registered.
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant ID</th>
                <th>Status</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((conn: WhatsAppConnection) => (
                <tr key={conn.tenant_id}>
                  <td className="cell-mono">{conn.tenant_id}</td>
                  <td>
                    <span
                      className={`badge ${STATUS_BADGE[conn.status] || "badge-neutral"}`}
                    >
                      {conn.status}
                    </span>
                  </td>
                  <td className="cell-mono">
                    {new Date(conn.updated_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
