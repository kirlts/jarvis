import React, { useEffect, useState } from 'react';
import { useCustom, useNavigation } from "@refinedev/core";

export const DashboardPage = () => {
    const { push } = useNavigation();
    const { data, isLoading, isError, error } = useCustom({
        url: 'dashboard/summary',
        method: 'get'
    });

    if (isLoading) return <div className="loading-spinner"></div>;

    if (isError) {
        return (
            <div className="error-banner">
                <p>Failed to load dashboard: {(error as any)?.message}</p>
            </div>
        );
    }

    const summary = data?.data;

    return (
        <div style={{ padding: 'var(--sp-6)' }}>
            <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--sp-6)', fontFamily: 'var(--font-sans)' }}>System Dashboard</h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--sp-6)' }}>
                {/* Tenants */}
                <div
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-4)', transition: 'transform var(--duration-fast) var(--ease-out)' }}
                    className="fade-in"
                    onClick={() => push('/tenants')}
                >
                    <h3 style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-2)' }}>Tenants</h3>
                    <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
                        <div><span className="badge badge-success"></span> {summary?.tenants?.active || 0} Active</div>
                        <div><span className="badge badge-warning"></span> {summary?.tenants?.suspended || 0} Suspended</div>
                        <div><span className="badge badge-danger"></span> {summary?.tenants?.deleted || 0} Deleted</div>
                    </div>
                </div>

                {/* Jobs */}
                <div
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-4)' }}
                    className="fade-in"
                    onClick={() => push('/jobs')}
                >
                    <h3 style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-2)' }}>Job Queue (24h)</h3>
                    <div style={{ display: 'flex', gap: 'var(--sp-4)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>
                        <div style={{ color: 'var(--info)' }}>{summary?.jobs?.active || 0} Active</div>
                        <div style={{ color: (summary?.jobs?.failed || 0) > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>{summary?.jobs?.failed || 0} Failed</div>
                        <div style={{ color: 'var(--success)' }}>{summary?.jobs?.completed || 0} Completed</div>
                    </div>
                </div>

                {/* WhatsApp */}
                <div
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-4)' }}
                    className="fade-in"
                    onClick={() => push('/whatsapp')}
                >
                    <h3 style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-2)' }}>WhatsApp Sessions</h3>
                    <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                        <span className="badge badge-success">{summary?.whatsapp?.connected || 0} Connected</span>
                        <span className="badge badge-warning">{summary?.whatsapp?.qr_pending || 0} QR Pending</span>
                        <span className="badge badge-danger" style={{ display: (summary?.whatsapp?.disconnected || 0) > 0 ? 'inline-block' : 'none' }}>{summary?.whatsapp?.disconnected || 0} Disconnected</span>
                    </div>
                </div>

                {/* Storage */}
                <div
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-4)' }}
                    className="fade-in"
                >
                    <h3 style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-2)' }}>Storage</h3>
                    <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
                        {summary?.storage?.files || 0} files
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                        {((summary?.storage?.bytes || 0) / (1024 * 1024)).toFixed(2)} MB
                    </div>
                </div>

                {/* Inbox */}
                <div
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-4)' }}
                    className="fade-in"
                >
                    <h3 style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-2)' }}>Sync Inbox Backlog</h3>
                    <div style={{
                        fontSize: 'var(--text-2xl)', fontWeight: 700,
                        color: (summary?.inbox?.pending || 0) > 1000 ? 'var(--danger)' : (summary?.inbox?.pending || 0) > 100 ? 'var(--warning)' : 'var(--success)'
                     }}>
                        {summary?.inbox?.pending || 0} Pending
                    </div>
                </div>

            </div>
        </div>
    );
};
