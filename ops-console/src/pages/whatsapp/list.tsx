import React, { useState } from "react";
import { useTable, useCustomMutation } from "@refinedev/core";

export const WhatsAppList = () => {
    const { tableQueryResult } = useTable({
        resource: "whatsapp/status",
        pagination: { mode: "off" }
    });

    const { mutate, isLoading: isMutating } = useCustomMutation();
    const { data, isLoading, isError } = tableQueryResult;
    const [selectedTenant, setSelectedTenant] = useState<string | null>(null);

    const handleAction = (tenantId: string, action: 'reconnect' | 'disconnect') => {
        if (window.confirm(`Are you sure you want to ${action} this session?`)) {
            mutate({
                url: `whatsapp/${tenantId}/${action}`,
                method: "post",
                values: {}
            });
        }
    };

    if (isError) return <div className="error-banner">Error loading WhatsApp status</div>;

    return (
        <div style={{ padding: "var(--sp-6)" }}>
            <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--sp-4)" }}>WhatsApp Sessions</h1>

            {isLoading ? (
                <div className="loading-spinner"></div>
            ) : data?.data.length === 0 ? (
                <div className="empty-state">No WhatsApp sessions found.</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--surface-2)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                        <thead>
                            <tr style={{ background: "var(--surface-3)", textAlign: "left" }}>
                                <th style={{ padding: "var(--sp-3)" }}>Tenant ID</th>
                                <th style={{ padding: "var(--sp-3)" }}>Status</th>
                                <th style={{ padding: "var(--sp-3)" }}>Last Updated</th>
                                <th style={{ padding: "var(--sp-3)" }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.data.map((session: any) => (
                                <React.Fragment key={session.tenant_id}>
                                    <tr
                                        style={{ borderBottom: "1px solid var(--surface-3)", cursor: "pointer" }}
                                        onClick={() => setSelectedTenant(selectedTenant === session.tenant_id ? null : session.tenant_id)}
                                    >
                                        <td style={{ padding: "var(--sp-3)" }} className="cell-mono">{session.tenant_id}</td>
                                        <td style={{ padding: "var(--sp-3)" }}>
                                            <span className={`badge badge-${
                                                session.status === 'connected' ? 'success' :
                                                session.status === 'disconnected' ? 'danger' : 'warning'
                                            }`}>
                                                {session.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: "var(--sp-3)" }}>{new Date(session.updated_at).toLocaleString()}</td>
                                        <td style={{ padding: "var(--sp-3)" }} onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => handleAction(session.tenant_id, 'reconnect')}
                                                disabled={isMutating}
                                                className="btn-primary btn-sm"
                                                style={{ marginRight: 'var(--sp-2)' }}
                                            >
                                                ↻ Reconnect
                                            </button>
                                            <button
                                                onClick={() => handleAction(session.tenant_id, 'disconnect')}
                                                disabled={isMutating}
                                                className="btn-danger btn-sm"
                                            >
                                                Disconnect
                                            </button>
                                        </td>
                                    </tr>
                                    {selectedTenant === session.tenant_id && (
                                        <tr style={{ background: 'var(--surface-1)' }}>
                                            <td colSpan={4} style={{ padding: 'var(--sp-4)' }}>
                                                <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
                                                    <a href={`http://localhost:3000/admin/whatsapp/${session.tenant_id}/messages/export`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'var(--accent)' }}>
                                                        ↓ Export Message History
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
