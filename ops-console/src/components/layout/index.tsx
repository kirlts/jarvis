import type { PropsWithChildren } from "react";
import { useState } from "react";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { Menu } from "../menu";

interface Identity {
  id: string;
  name: string;
  role: string;
}

export const Layout: React.FC<PropsWithChildren> = ({ children }) => {
  const { data: identity } = useGetIdentity<Identity>();
  const { mutate: logout } = useLogout();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`app-layout ${isCollapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {!isCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <div className="sidebar-brand-icon">J</div>
              <span className="sidebar-brand-text">Jarvis</span>
            </div>
          )}
          <button 
            className="btn btn-ghost btn-sm" 
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{ padding: '0 4px' }}
            title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {isCollapsed ? "◧" : "◨"}
          </button>
        </div>

        <Menu collapsed={isCollapsed} />

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {identity?.name?.[0]?.toUpperCase() || "A"}
            </div>
            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {identity?.name || "Admin"}
              </div>
              <div>{identity?.role || "super_admin"}</div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => logout()}
            style={{ marginTop: "var(--sp-3)", width: "100%" }}
            id="logout-button"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
};
