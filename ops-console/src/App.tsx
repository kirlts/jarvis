import { Refine, Authenticated } from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
  DocumentTitleHandler,
  UnsavedChangesNotifier,
  NavigateToResource,
} from "@refinedev/react-router";
import { BrowserRouter, Route, Routes, Outlet, Navigate } from "react-router";
import "./App.css";
import { dataProvider } from "./providers/data";
import { authProvider } from "./providers/auth";
import { ToastProvider } from "./components/toast";

// Layout
import { Layout } from "./components/layout";

// Pages
import { LoginPage } from "./pages/login";
import { DashboardPage } from "./pages/dashboard";
import { TenantListPage } from "./pages/tenants/list";
import { TenantCreatePage } from "./pages/tenants/create";
import { TenantDetailPage } from "./pages/tenants/detail";
import { OperacionesPage } from "./pages/operaciones";
import { SistemaPage } from "./pages/sistema";
import { StorageBrowserPage } from "./pages/storage/list";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <DevtoolsProvider>
          <ToastProvider>
          <Refine
            dataProvider={dataProvider}
            authProvider={authProvider}
            routerProvider={routerProvider}
            resources={[
              {
                name: "dashboard",
                list: "/dashboard",
                meta: { label: "Dashboard" },
              },
              {
                name: "tenants",
                list: "/usuarios",
                create: "/usuarios/crear",
                show: "/usuarios/:id",
                meta: { label: "Usuarios" },
              },
              {
                name: "jobs",
                list: "/operaciones",
                meta: { label: "Operaciones" },
              },
              {
                name: "whatsapp",
                list: "/operaciones",
                meta: { hide: true },
              },
              {
                name: "audit",
                list: "/operaciones",
                meta: { hide: true },
              },
              {
                name: "storage",
                list: "/storage",
                meta: { label: "Storage" },
              },
              {
                name: "config",
                list: "/sistema",
                meta: { hide: true },
              },
              {
                name: "logs",
                list: "/operaciones",
                meta: { hide: true },
              },
              {
                name: "tokens",
                list: "/sistema",
                meta: { hide: true },
              },
              {
                name: "inbox",
                list: "/operaciones",
                meta: { hide: true },
              },
              {
                name: "health",
                list: "/sistema",
                meta: { hide: true },
              },
            ]}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
              projectId: "4J4HNK-Aul7xX-zYoMPX",
              disableTelemetry: true,
            }}
          >
            <Routes>
              {/* Rutas protegidas con layout */}
              <Route
                element={
                  <Authenticated
                    key="authenticated-routes"
                    fallback={<Navigate to="/login" />}
                  >
                    <Layout>
                      <Outlet />
                    </Layout>
                  </Authenticated>
                }
              >
                <Route
                  index
                  element={<NavigateToResource resource="dashboard" />}
                />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/usuarios" element={<TenantListPage />} />
                <Route path="/usuarios/crear" element={<TenantCreatePage />} />
                <Route path="/usuarios/:id" element={<TenantDetailPage />} />
                <Route path="/operaciones" element={<OperacionesPage />} />
                <Route path="/storage" element={<StorageBrowserPage />} />
                <Route path="/sistema" element={<SistemaPage />} />

                {/* Redirects de rutas antiguas */}
                <Route path="/tenants" element={<Navigate to="/usuarios" replace />} />
                <Route path="/tenants/create" element={<Navigate to="/usuarios/crear" replace />} />
                <Route path="/tenants/:id" element={<Navigate to="/usuarios/:id" replace />} />
                <Route path="/jobs" element={<Navigate to="/operaciones" replace />} />
                <Route path="/audit" element={<Navigate to="/operaciones" replace />} />
                <Route path="/logs" element={<Navigate to="/operaciones" replace />} />
                <Route path="/config" element={<Navigate to="/sistema" replace />} />
                <Route path="/tokens" element={<Navigate to="/sistema" replace />} />
                <Route path="/health" element={<Navigate to="/sistema" replace />} />
                <Route path="/inbox" element={<Navigate to="/operaciones" replace />} />
                <Route path="/whatsapp" element={<Navigate to="/usuarios" replace />} />
              </Route>

              {/* Rutas públicas (login) */}
              <Route
                element={
                  <Authenticated key="auth-pages" fallback={<Outlet />}>
                    <NavigateToResource resource="dashboard" />
                  </Authenticated>
                }
              >
                <Route path="/login" element={<LoginPage />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <RefineKbar />
            <UnsavedChangesNotifier />
            <DocumentTitleHandler />
          </Refine>
          <DevtoolsPanel />
          </ToastProvider>
        </DevtoolsProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
