
import React, { useState } from "react";
import { useTable, useCustomMutation } from "@refinedev/core";

export const InboxList = () => {
    const { tableQueryResult, filters, setFilters } = useTable({
        resource: "inbox",
        pagination: { pageSize: 50 }
    });

    const { mutate } = useCustomMutation();
    const { data, isLoading, isError } = tableQueryResult;

    if (isError) return <div className="error-banner">Error loading inbox</div>;

    return (
        <div style={{ padding: "var(--sp-6)" }}>
            <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--sp-4)" }}>Sync Inbox</h1>
            {isLoading ? <div className="loading-spinner"></div> : (
                <table style={{ width: "100%", background: "var(--surface-2)" }}>
                    <thead><tr><th>ID</th><th>Status</th><th>Tenant</th></tr></thead>
                    <tbody>
                        {data?.data.map((item: any) => (
                            <tr key={item.id}>
                                <td className="cell-mono">{item.id}</td>
                                <td>{item.status}</td>
                                <td>{item.tenant_id}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};
