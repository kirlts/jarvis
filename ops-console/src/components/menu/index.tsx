import { NavLink } from "react-router";

interface NavItem {
  path: string;
  label: string;
  icon: string;  /* Unicode text character — inherits currentColor via CSS */
}

const SECCION_OPERACION: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: "◧" },
  { path: "/usuarios", label: "Usuarios", icon: "◉" },
];

const SECCION_SISTEMA: NavItem[] = [
  { path: "/operaciones", label: "Operaciones", icon: "⚙" },
  { path: "/storage", label: "Storage", icon: "▤" },
  { path: "/sistema", label: "Sistema", icon: "⚒" },
];

export const Menu = ({ collapsed = false }: { collapsed?: boolean }) => {
  return (
    <nav>
      {!collapsed && <span className="sidebar-section-label">Operación</span>}
      <ul className="sidebar-nav">
        {SECCION_OPERACION.map((item) => (
          <li key={item.path}>
            <NavLink to={item.path} title={collapsed ? item.label : undefined}>
              <span className="sidebar-nav-icon">{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      {!collapsed && <span className="sidebar-section-label">Sistema</span>}
      <ul className="sidebar-nav">
        {SECCION_SISTEMA.map((item) => (
          <li key={item.path}>
            <NavLink to={item.path} title={collapsed ? item.label : undefined}>
              <span className="sidebar-nav-icon">{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};
