
import React from "react";
import { useTable } from "@refinedev/core";

export const StorageList = () => {
    const { tableQueryResult } = useTable({ resource: "storage/usage", pagination: { mode: "off" } });
    const { data, isLoading } = tableQueryResult;
    return (
        <div style={{ padding: "var(--sp-6)" }}>
            <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--sp-4)" }}>Storage Usage</h1>
            {isLoading ? <div className="loading-spinner"></div> : (
                <table style={{ width: "100%", background: "var(--surface-2)" }}>
                    <thead><tr><th>Tenant</th><th>Files</th><th>Bytes</th></tr></thead>
                    <tbody>
                        {data?.data.map((r: any) => (
                            <tr key={r.tenant_id}>
                                <td>{r.tenant_id}</td><td>{r.files}</td><td>{r.bytes}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};
