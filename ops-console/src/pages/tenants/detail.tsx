import React, { useState } from "react";
import { useShow, useUpdate, useNavigation, useCustom, useCustomMutation } from "@refinedev/core";

export const TenantDetail = () => {
    const { queryResult } = useShow();
    const { data, isLoading, isError } = queryResult;
    const tenant = data?.data;

    const [activeTab, setActiveTab] = useState("overview");
    const [editName, setEditName] = useState(false);
    const [nameVal, setNameVal] = useState("");
    const [configVal, setConfigVal] = useState("");

    const { mutate: updateTenant } = useUpdate();
    const { mutate: customMutate } = useCustomMutation();
    const { push } = useNavigation();

    // Reset local state when data loads
    React.useEffect(() => {
        if (tenant) {
            setNameVal(tenant.name);
            setConfigVal(JSON.stringify(tenant.config || {}, null, 2));
        }
    }, [tenant]);

    const { data: statsData, isLoading: statsLoading } = useCustom({
        url: `tenants/${tenant?.id}/stats`,
        method: "get",
        queryOptions: {
            enabled: !!tenant?.id && activeTab === 'overview',
        }
    });

    if (isLoading) return <div className="loading-spinner"></div>;
    if (isError || !tenant) return <div className="error-banner">Tenant not found</div>;

    const handleSaveName = (e: any) => {
        if (e.key === 'Enter') {
            updateTenant({
                resource: "tenants",
                id: tenant.id,
                values: { name: nameVal },
            });
            setEditName(false);
        } else if (e.key === 'Escape') {
            setEditName(false);
            setNameVal(tenant.name);
        }
    };

    const handleSaveConfig = () => {
        try {
            const parsed = JSON.parse(configVal);
            updateTenant({
                resource: "tenants",
                id: tenant.id,
                values: { config: parsed },
            });
        } catch (e) {
            alert("Invalid JSON");
        }
    };

    const handleStatusToggle = (newStatus: string) => {
        customMutate({
            url: `tenants/${tenant.id}/status`,
            method: "patch",
            values: { status: newStatus }
        });
    };

    const handleRestore = () => {
        if (window.confirm("Restore this tenant?")) {
            customMutate({
                url: `tenants/${tenant.id}/restore`,
                method: "post",
                values: {}
            });
        }
    };

    const generateToken = () => {
        customMutate({
            url: `tenants/${tenant.id}/token`,
            method: "post",
            values: {}
        }, {
            onSuccess: (data) => {
                alert("Generated Token: " + data.data.token + "\\n\\nCopy this now, it won't be shown again.");
            }
        });
    }

    return (
        <div style={{ padding: "var(--sp-6)" }}>
            <button onClick={() => push('/tenants')} className="btn-ghost" style={{ marginBottom: 'var(--sp-4)' }}>← Back</button>

            <div style={{ background: "var(--surface-2)", padding: "var(--sp-6)", borderRadius: "var(--radius-lg)", marginBottom: "var(--sp-6)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        {editName ? (
                            <input
                                value={nameVal}
                                onChange={e => setNameVal(e.target.value)}
                                onKeyDown={handleSaveName}
                                autoFocus
                                className="form-input"
                                style={{ fontSize: 'var(--text-2xl)', background: 'transparent' }}
                            />
                        ) : (
                            <h1
                                style={{ fontSize: "var(--text-2xl)", cursor: 'pointer' }}
                                onClick={() => setEditName(true)}
                            >
                                {tenant.name} ✎
                            </h1>
                        )}
                        <p className="cell-mono" style={{ color: "var(--text-secondary)" }}>{tenant.id}</p>
                    </div>
                    <div>
                        <span className={`badge badge-${tenant.status === 'active' ? 'success' : tenant.status === 'suspended' ? 'danger' : 'warning'}`}>
                            {tenant.status}
                        </span>
                        {tenant.deleted_at && <span className="badge badge-danger" style={{ marginLeft: 'var(--sp-2)' }}>Deleted</span>}
                    </div>
                </div>

                <div style={{ marginTop: 'var(--sp-4)', display: 'flex', gap: 'var(--sp-2)' }}>
                    {tenant.status === 'active' ? (
                        <button onClick={() => handleStatusToggle('suspended')} className="btn-danger" style={{ padding: 'var(--sp-2) var(--sp-4)', borderRadius: 'var(--radius-md)' }}>Suspend</button>
                    ) : (
                        <button onClick={() => handleStatusToggle('active')} style={{ background: 'var(--accent)', color: '#fff', padding: 'var(--sp-2) var(--sp-4)', border: 'none', borderRadius: 'var(--radius-md)' }}>Reactivate</button>
                    )}
                    {tenant.deleted_at && (
                        <button onClick={handleRestore} style={{ background: 'var(--success)', color: '#fff', padding: 'var(--sp-2) var(--sp-4)', border: 'none', borderRadius: 'var(--radius-md)' }}>Restore Tenant</button>
                    )}
                    <button onClick={generateToken} style={{ background: 'var(--surface-3)', border: '1px solid var(--border-subtle)', padding: 'var(--sp-2) var(--sp-4)', borderRadius: 'var(--radius-md)' }}>Generate API Token</button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-4)', borderBottom: '1px solid var(--border-subtle)', marginBottom: 'var(--sp-6)' }}>
                {['overview', 'config'].map(tab => (
                    <div
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: 'var(--sp-2) var(--sp-4)',
                            cursor: 'pointer',
                            borderBottom: activeTab === tab ? '2px solid var(--accent)' : 'none',
                            fontWeight: activeTab === tab ? 600 : 400
                        }}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </div>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div>
                    {statsLoading ? <div className="loading-spinner"></div> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-4)' }}>
                            <div style={{ background: 'var(--surface-2)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ color: 'var(--text-secondary)' }}>WhatsApp</div>
                                <div>{statsData?.data?.whatsapp_status}</div>
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ color: 'var(--text-secondary)' }}>Failed Jobs</div>
                                <div style={{ color: statsData?.data?.failed_jobs > 0 ? 'var(--danger)' : 'inherit' }}>{statsData?.data?.failed_jobs}</div>
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ color: 'var(--text-secondary)' }}>Storage</div>
                                <div>{statsData?.data?.storage_files} files ({(statsData?.data?.storage_bytes / 1024 / 1024).toFixed(2)} MB)</div>
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ color: 'var(--text-secondary)' }}>Inbox Pending</div>
                                <div>{statsData?.data?.inbox_pending}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'config' && (
                <div>
                    <textarea
                        value={configVal}
                        onChange={e => setConfigVal(e.target.value)}
                        className="cell-mono"
                        style={{
                            width: '100%', height: '300px',
                            background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
                            padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)'
                        }}
                    />
                    <button
                        onClick={handleSaveConfig}
                        style={{ marginTop: 'var(--sp-4)', background: 'var(--accent)', color: '#fff', border: 'none', padding: 'var(--sp-2) var(--sp-4)', borderRadius: 'var(--radius-md)' }}
                    >
                        Save Configuration
                    </button>
                </div>
            )}

        </div>
    );
};
