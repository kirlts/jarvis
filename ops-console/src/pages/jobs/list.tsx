import React, { useState } from "react";
import { useTable, useCustomMutation } from "@refinedev/core";

export const JobList = () => {
    const [stateFilter, setStateFilter] = useState("");
    const [queueFilter, setQueueFilter] = useState("");

    const { tableQueryResult, filters, setFilters } = useTable({
        resource: "jobs",
        pagination: { pageSize: 50 },
        filters: {
            initial: [],
        }
    });

    const { mutate } = useCustomMutation();
    const { data, isLoading, isError } = tableQueryResult;

    // A real implementation would parse filters correctly via refine.
    // For brevity, we handle it simply
    const applyFilters = (state: string, queue: string) => {
        setStateFilter(state);
        setQueueFilter(queue);
        let currentFilters: any[] = [];
        if (state) currentFilters.push({ field: "state", value: state, operator: "eq" });
        if (queue) currentFilters.push({ field: "name", value: queue, operator: "eq" });
        setFilters(currentFilters);
    };

    const handleRetry = (id: string) => {
        if (window.confirm("Retry this job?")) {
            mutate({ url: `jobs/${id}/retry`, method: "post", values: {} });
        }
    };

    const handleCancel = (id: string) => {
        if (window.confirm("Cancel this job?")) {
            mutate({ url: `jobs/${id}/cancel`, method: "post", values: {} });
        }
    };

    if (isError) return <div className="error-banner">Error loading jobs</div>;

    return (
        <div style={{ padding: "var(--sp-6)" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
                <h1 style={{ fontSize: "var(--text-2xl)" }}>Jobs (pg-boss)</h1>
                <button className="btn-ghost" onClick={() => window.open('http://localhost:3000/admin/jobs/export', '_blank')}>↓ Export CSV</button>
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
                <select
                    className="form-input"
                    value={stateFilter}
                    onChange={(e) => applyFilters(e.target.value, queueFilter)}
                >
                    <option value="">All States</option>
                    <option value="created">Created</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <input
                    className="form-input"
                    placeholder="Filter by Queue Name"
                    value={queueFilter}
                    onChange={(e) => applyFilters(stateFilter, e.target.value)}
                />
            </div>

            {isLoading ? (
                <div className="loading-spinner"></div>
            ) : data?.data.length === 0 ? (
                <div className="empty-state">No jobs found.</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--surface-2)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                        <thead>
                            <tr style={{ background: "var(--surface-3)", textAlign: "left" }}>
                                <th style={{ padding: "var(--sp-3)" }}>ID</th>
                                <th style={{ padding: "var(--sp-3)" }}>Queue Name</th>
                                <th style={{ padding: "var(--sp-3)" }}>State</th>
                                <th style={{ padding: "var(--sp-3)" }}>Created</th>
                                <th style={{ padding: "var(--sp-3)" }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.data.map((job: any) => (
                                <tr key={job.id} style={{ borderBottom: "1px solid var(--surface-3)" }}>
                                    <td style={{ padding: "var(--sp-3)" }} className="cell-mono">{job.id.split("-")[0]}...</td>
                                    <td style={{ padding: "var(--sp-3)" }}>{job.name}</td>
                                    <td style={{ padding: "var(--sp-3)" }}>
                                        <span className={`badge badge-${
                                            job.state === 'completed' ? 'success' :
                                            job.state === 'failed' ? 'danger' :
                                            job.state === 'active' ? 'info' : 'neutral'
                                        }`}>
                                            {job.state}
                                        </span>
                                    </td>
                                    <td style={{ padding: "var(--sp-3)" }}>{new Date(job.created_on).toLocaleString()}</td>
                                    <td style={{ padding: "var(--sp-3)" }}>
                                        {job.state === 'failed' && (
                                            <button onClick={() => handleRetry(job.id)} className="btn-primary btn-sm">Retry</button>
                                        )}
                                        {job.state === 'created' && (
                                            <button onClick={() => handleCancel(job.id)} className="btn-danger btn-sm">Cancel</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
