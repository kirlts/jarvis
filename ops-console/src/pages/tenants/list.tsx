import React, { useState } from "react";
import { useTable, useDelete, useNavigation, useExport } from "@refinedev/core";

export const TenantList = () => {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("active");
    const { push } = useNavigation();
    const { tableQueryResult } = useTable({
        resource: "tenants",
        pagination: { pageSize: 20 },
        filters: {
            initial: [
                { field: "status", value: statusFilter, operator: "eq" }
            ],
            permanent: [
                { field: "q", value: search, operator: "eq" },
                { field: "status", value: statusFilter, operator: "eq" }
            ]
        }
    });

    const { mutate: deleteTenant, isLoading: isDeleting } = useDelete();
    const { data, isLoading, isError } = tableQueryResult;

    // Add export dummy for now (would need real url or download logic)
    const exportTenants = () => {
        window.open('http://localhost:3000/admin/tenants/export', '_blank');
    }

    if (isError) return <div className="error-banner">Error loading tenants</div>;

    return (
        <div style={{ padding: "var(--sp-6)" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
                <h1 style={{ fontSize: "var(--text-2xl)" }}>Tenants</h1>
                <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <button className="btn-ghost" onClick={exportTenants}>
                        ↓ Export CSV
                    </button>
                    <button onClick={() => push('/tenants/create')} style={{
                        background: "var(--accent)", color: "#fff", padding: "var(--sp-2) var(--sp-4)",
                        borderRadius: "var(--radius-md)", border: "none", cursor: "pointer"
                    }}>
                        + Create Tenant
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
                <input
                    type="text"
                    placeholder="Search tenants..."
                    className="form-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', padding: 'var(--sp-2)', borderRadius: 'var(--radius-md)' }}
                />
                <select
                    className="form-input"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', padding: 'var(--sp-2)', borderRadius: 'var(--radius-md)' }}
                >
                    <option value="active">Active</option>
                    <option value="deleted">Deleted</option>
                    <option value="suspended">Suspended</option>
                    <option value="trial">Trial</option>
                    <option value="all">All</option>
                </select>
            </div>

            {isLoading ? (
                <div className="loading-spinner"></div>
            ) : data?.data.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No tenants match '{search}'.
                </div>
            ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--surface-2)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                    <thead>
                        <tr style={{ background: "var(--surface-3)", textAlign: "left" }}>
                            <th style={{ padding: "var(--sp-3)" }}>ID</th>
                            <th style={{ padding: "var(--sp-3)" }}>Name</th>
                            <th style={{ padding: "var(--sp-3)" }}>Status</th>
                            <th style={{ padding: "var(--sp-3)" }}>Created At</th>
                            <th style={{ padding: "var(--sp-3)" }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.data.map((tenant: any) => (
                            <tr key={tenant.id} style={{ borderBottom: "1px solid var(--surface-3)", cursor: "pointer" }}
                                onClick={() => push(`/tenants/${tenant.id}`)}
                            >
                                <td style={{ padding: "var(--sp-3)" }} className="cell-mono">{tenant.id.split("-")[0]}...</td>
                                <td style={{ padding: "var(--sp-3)" }}>{tenant.name}</td>
                                <td style={{ padding: "var(--sp-3)" }}>
                                    <span className={`badge badge-${tenant.status === 'active' ? 'success' : tenant.status === 'suspended' ? 'danger' : 'warning'}`}>
                                        {tenant.status}
                                    </span>
                                </td>
                                <td style={{ padding: "var(--sp-3)" }}>{new Date(tenant.created_at).toLocaleDateString()}</td>
                                <td style={{ padding: "var(--sp-3)" }} onClick={e => e.stopPropagation()}>
                                    {!tenant.deleted_at && (
                                        <button
                                            onClick={() => {
                                                if (window.confirm("Delete tenant?")) {
                                                    deleteTenant({ resource: "tenants", id: tenant.id });
                                                }
                                            }}
                                            disabled={isDeleting}
                                            style={{ color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}
                                        >
                                            Delete
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};
