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

// Layout
import { Layout } from "./components/layout";

// Pages
import { LoginPage } from "./pages/login";
import { TenantListPage } from "./pages/tenants/list";
import { TenantCreatePage } from "./pages/tenants/create";
import { JobListPage } from "./pages/jobs/list";
import { WhatsAppStatusPage } from "./pages/whatsapp/list";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <DevtoolsProvider>
          <Refine
            dataProvider={dataProvider}
            authProvider={authProvider}
            routerProvider={routerProvider}
            resources={[
              {
                name: "tenants",
                list: "/tenants",
                create: "/tenants/create",
                meta: { label: "Tenants" },
              },
              {
                name: "jobs",
                list: "/jobs",
                meta: { label: "Jobs" },
              },
              {
                name: "whatsapp",
                list: "/whatsapp",
                meta: { label: "WhatsApp" },
              },
            ]}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
              projectId: "4J4HNK-Aul7xX-zYoMPX",
            }}
          >
            <Routes>
              {/* Protected routes with layout */}
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
                  element={<NavigateToResource resource="tenants" />}
                />
                <Route path="/tenants" element={<TenantListPage />} />
                <Route path="/tenants/create" element={<TenantCreatePage />} />
                <Route path="/jobs" element={<JobListPage />} />
                <Route path="/whatsapp" element={<WhatsAppStatusPage />} />
              </Route>

              {/* Public routes (login) */}
              <Route
                element={
                  <Authenticated key="auth-pages" fallback={<Outlet />}>
                    <NavigateToResource resource="tenants" />
                  </Authenticated>
                }
              >
                <Route path="/login" element={<LoginPage />} />
              </Route>
            </Routes>
            <RefineKbar />
            <UnsavedChangesNotifier />
            <DocumentTitleHandler />
          </Refine>
          <DevtoolsPanel />
        </DevtoolsProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
