import { useMenu } from "@refinedev/core";
import { NavLink } from "react-router";

const NAV_ICONS: Record<string, string> = {
  tenants: "👥",
  jobs: "⚙️",
  whatsapp: "💬",
};

export const Menu = () => {
  const { menuItems } = useMenu();

  return (
    <ul className="sidebar-nav">
      {menuItems.map((item) => (
        <li key={item.key}>
          <NavLink to={item.route ?? "/"}>
            <span className="sidebar-nav-icon">
              {NAV_ICONS[item.key] || "📄"}
            </span>
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
};
