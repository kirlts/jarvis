
import React from "react";
import { useTable } from "@refinedev/core";

export const AuditList = () => {
    const { tableQueryResult } = useTable({ resource: "audit", pagination: { pageSize: 50 } });
    const { data, isLoading } = tableQueryResult;
    return (
        <div style={{ padding: "var(--sp-6)" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
                <h1 style={{ fontSize: "var(--text-2xl)" }}>Audit Trail</h1>
                <button className="btn-ghost" onClick={() => window.open('http://localhost:3000/admin/audit/export', '_blank')}>↓ Export CSV</button>
            </div>
            {isLoading ? <div className="loading-spinner"></div> : (
                <table style={{ width: "100%", background: "var(--surface-2)" }}>
                    <thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
                    <tbody>
                        {data?.data.map((r: any) => (
                            <tr key={r.id}>
                                <td>{new Date(r.created_at).toLocaleString()}</td>
                                <td>{r.actor}</td><td>{r.action}</td><td>{r.resource}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};
