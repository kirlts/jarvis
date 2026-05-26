import React from 'react';
import { createRoot } from 'react-dom/client';
import { Refine } from '@refinedev/core';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import routerProvider, { NavigateToResource } from '@refinedev/react-router-v6';
import { dataProvider } from './providers/data';
import { authProvider } from './providers/auth';

import { LoginPage } from './pages/login';
import { DashboardPage } from './pages/dashboard';
import { TenantList } from './pages/tenants/list';
import { TenantCreate } from './pages/tenants/create';
import { TenantDetail } from './pages/tenants/detail';
import { JobList } from './pages/jobs/list';
import { WhatsAppList } from './pages/whatsapp/list';

import './App.css';

const Layout = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-1)', color: 'var(--text-primary)' }}>
        <nav style={{ width: '250px', background: 'var(--surface-2)', padding: 'var(--sp-4)', borderRight: '1px solid var(--border-subtle)' }}>
            <h2 style={{ marginBottom: 'var(--sp-8)' }}>Jarvis Ops</h2>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                <li><a href="/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>Dashboard</a></li>
                <li><a href="/tenants" style={{ textDecoration: 'none', color: 'inherit' }}>Tenants</a></li>
                <li><a href="/jobs" style={{ textDecoration: 'none', color: 'inherit' }}>Jobs</a></li>
                <li><a href="/inbox" style={{ textDecoration: 'none', color: 'inherit' }}>Sync Inbox</a></li>
                <li><a href="/whatsapp" style={{ textDecoration: 'none', color: 'inherit' }}>WhatsApp</a></li>
                <li><a href="/storage" style={{ textDecoration: 'none', color: 'inherit' }}>Storage</a></li>
                <li><a href="/logs" style={{ textDecoration: 'none', color: 'inherit' }}>Logs</a></li>
                <li><a href="/audit" style={{ textDecoration: 'none', color: 'inherit' }}>Audit Trail</a></li>
            </ul>
        </nav>
        <main style={{ flex: 1 }}>
            {children}
        </main>
    </div>
);

const App = () => {
    return (
        <BrowserRouter>
            <Refine
                dataProvider={dataProvider}
                authProvider={authProvider}
                routerProvider={routerProvider}
                resources={[
                    { name: 'dashboard', list: '/dashboard' },
                    { name: 'tenants', list: '/tenants', create: '/tenants/create', show: '/tenants/:id' },
                    { name: 'jobs', list: '/jobs' },
                    { name: 'inbox', list: '/inbox' },
                    { name: 'whatsapp', list: '/whatsapp' },
                    { name: 'storage', list: '/storage' },
                    { name: 'logs', list: '/logs' },
                    { name: 'audit', list: '/audit' }
                ]}
            >
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        element={
                            <Layout>
                                <Outlet />
                            </Layout>
                        }
                    >
                        <Route index element={<NavigateToResource resource="dashboard" />} />
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/tenants">
                            <Route index element={<TenantList />} />
                            <Route path="create" element={<TenantCreate />} />
                            <Route path=":id" element={<TenantDetail />} />
                        </Route>
                        <Route path="/jobs" element={<JobList />} />
                        <Route path="/whatsapp" element={<WhatsAppList />} />
                        {/* Placeholders for others to prevent crashes */}
                        <Route path="/inbox" element={<div style={{padding:'24px'}}>Inbox coming soon</div>} />
                        <Route path="/storage" element={<div style={{padding:'24px'}}>Storage coming soon</div>} />
                        <Route path="/logs" element={<div style={{padding:'24px'}}>Logs coming soon</div>} />
                        <Route path="/audit" element={<div style={{padding:'24px'}}>Audit coming soon</div>} />
                    </Route>
                </Routes>
            </Refine>
        </BrowserRouter>
    );
};

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
